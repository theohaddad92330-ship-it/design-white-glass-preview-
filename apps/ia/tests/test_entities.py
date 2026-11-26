"""Entity relevance — strip the legal noise (SCI / holdings / GIE) from the
Pappers subsidiary dump so the cartography shows operating entities, not the
"98 filiales dont des SCI" a salesperson can't sell IT services to."""

from __future__ import annotations

from app.services.entities import (
    annotate_entity_relevance,
    classify_entity_relevance,
    classify_entity_type,
    classify_subsidiary,
    derive_allow_international,
    derive_in_scope_families,
    derive_no_go_keywords,
    gets_play,
    in_scope_entities,
    partition_subsidiaries,
)


def test_foreign_entities_are_out_of_scope_for_a_france_esn():
    # Théo: SG Côte d'Ivoire / SGTM au Maroc / Afrique = mauvais scope.
    for name in (
        "Société Générale Côte d'Ivoire",
        "SGTM (Société Générale des Travaux du Maroc)",
        "SG Côte d'Ivoire (SGCS WA - SG Côte d'Ivoire West Africa)",
        "SG Sénégal",
        "Filiale Afrique de l'Ouest",
    ):
        relevance, reason = classify_entity_relevance(name)
        assert relevance == "out_of_sector", name

    # A French entity is untouched by the geo gate.
    assert classify_entity_relevance("Boursorama")[0] == "operating"
    assert classify_entity_relevance("Société Générale SFH")[0] == "operating"


def test_geo_gate_beats_the_it_override():
    # Even a foreign IT arm is out of perimeter for a France-scoped ESN.
    relevance, _ = classify_entity_relevance("SG Côte d'Ivoire Digital Factory")
    assert relevance == "out_of_sector"


def test_international_profile_keeps_foreign_entities():
    relevance, _ = classify_entity_relevance("Société Générale Côte d'Ivoire", allow_international=True)
    assert relevance == "operating"


def test_derive_allow_international():
    assert derive_allow_international("France entière") is False
    assert derive_allow_international("") is False
    assert derive_allow_international(None) is False
    assert derive_allow_international("International") is True
    assert derive_allow_international("France, Afrique de l'Ouest") is True
    assert derive_allow_international("EMEA") is True


def test_in_scope_entities_drops_out_of_scope_but_keeps_unknown():
    entities = [
        {"name": "SG Global Banking", "getsPlay": True},
        {"name": "Société Générale des Travaux du Maroc", "getsPlay": False},
        {"name": "SG Côte d'Ivoire", "getsPlay": False},
        {"name": "Entité sans annotation"},  # no getsPlay → benefit of the doubt
    ]
    kept = in_scope_entities(entities)
    names = [e["name"] for e in kept]
    assert "SG Global Banking" in names
    assert "Entité sans annotation" in names
    assert "Société Générale des Travaux du Maroc" not in names
    assert "SG Côte d'Ivoire" not in names


def test_in_scope_entities_handles_none_and_non_mappings():
    assert in_scope_entities(None) == []
    assert in_scope_entities([{"getsPlay": True}, "junk", 42]) == [{"getsPlay": True}]


# ── A2 : gate profile-aware (secteurs no-go déclarés par l'ESN, Théo §9) ──────
def test_derive_no_go_keywords_extracts_distinctive_tokens():
    assert derive_no_go_keywords(["Assurance"]) == frozenset({"assurance"})
    assert derive_no_go_keywords(["Grande distribution"]) == frozenset({"distribution"})  # "grande" = stopword
    assert derive_no_go_keywords([]) == frozenset()
    assert derive_no_go_keywords(None) == frozenset()


def test_no_go_sector_entity_is_out_of_sector():
    kws = derive_no_go_keywords(["Assurance"])
    # Prefix match on a whole token → "Assurances" (pluriel) matche "assurance".
    relevance, reason = classify_entity_relevance("VINCI Assurances", no_go_keywords=kws)
    assert relevance == "out_of_sector"
    assert "no-go" in reason


def test_no_go_does_not_touch_entities_outside_the_sector():
    kws = derive_no_go_keywords(["Assurance"])
    relevance, _ = classify_entity_relevance("VINCI Energies", no_go_keywords=kws)
    assert relevance == "operating"


def test_no_go_does_not_over_match_a_derived_word():
    # Whole-token/plural only: no-go "banque" must NOT demote "Banquette Industries".
    kws = derive_no_go_keywords(["Banque"])
    assert classify_entity_relevance("Banquette Industries", no_go_keywords=kws)[0] == "operating"
    assert classify_entity_relevance("VINCI Banque", no_go_keywords=kws)[0] == "out_of_sector"


def test_no_go_plural_and_singular_match_both_ways():
    # Review fix: a plural-worded no-go ("Banques") must match a singular entity
    # token ("Banque"), and vice-versa — the match was one-directional.
    plural_kw = derive_no_go_keywords(["Banques"])
    assert classify_entity_relevance("VINCI Banque", no_go_keywords=plural_kw)[0] == "out_of_sector"
    singular_kw = derive_no_go_keywords(["Banque"])
    assert classify_entity_relevance("VINCI Banques", no_go_keywords=singular_kw)[0] == "out_of_sector"


def test_no_go_handles_3_letter_sectors():
    # Review fix: len>=4 dropped 3-letter sectors → no-go was a silent no-op for BTP.
    kws = derive_no_go_keywords(["BTP"])
    assert kws == frozenset({"btp"})
    assert classify_entity_relevance("Bouygues BTP", no_go_keywords=kws)[0] == "out_of_sector"


def test_no_go_is_a_noop_when_profile_declares_none():
    # Inert in current prod (profile has no no-go field yet) — no behaviour change.
    relevance, _ = classify_entity_relevance("VINCI Assurances", no_go_keywords=frozenset())
    assert relevance == "operating"


def test_it_arm_overrides_no_go():
    # The ESN sells IT — a no-go sector never demotes the group's IT entity.
    out = annotate_entity_relevance(
        {"name": "Assurances", "isItEntity": True}, no_go_keywords=derive_no_go_keywords(["Assurance"])
    )
    assert out["relevance"] == "operating"
    assert out["getsPlay"] is True


def test_partition_applies_no_go_keywords():
    subs = [{"siren": "1", "name": "VINCI Assurances"}, {"siren": "2", "name": "VINCI Energies"}]
    part = partition_subsidiaries(subs, frozenset(), derive_no_go_keywords(["Assurance"]))
    by_name = {s["name"]: s for s in part["annotated"]}
    assert by_name["VINCI Assurances"]["relevance"] == "out_of_sector"
    assert by_name["VINCI Energies"]["relevance"] == "operating"

# Real Société-Générale-shaped graph nodes (name + siren only — corporate-graph
# nodes carry no NAF), mixing operating companies with real-estate / holding noise.
SG_SUBS = [
    {"siren": "351497239", "name": "BOURSORAMA"},
    {"siren": "552120222", "name": "SOCIÉTÉ GÉNÉRALE SECURITIES SERVICES"},
    {"siren": "472500503", "name": "SOCIÉTÉ DE BOURSE GILBERT DUPONT"},
    {"siren": "300000001", "name": "SCI SAINT-PÈRES"},
    {"siren": "300000002", "name": "SCI 29 HAUSSMANN"},
    {"siren": "300000003", "name": "SOGE IMMOBILIER PARTICIPATIONS"},
    {"siren": "300000004", "name": "GIE COMMERC C C BOIS ST PERES"},
    {"siren": "300000005", "name": "SG HOLDING FONCIÈRE"},
    {"siren": "300000006", "name": "X"},
]


def test_operating_companies_are_kept():
    for name in ("BOURSORAMA", "SOCIÉTÉ GÉNÉRALE SECURITIES SERVICES", "SOGECAP", "ALD AUTOMOTIVE"):
        rel, reason = classify_subsidiary(name)
        assert rel == "operating", (name, reason)
        assert reason == ""


def test_sci_and_real_estate_are_noise():
    for name in ("SCI SAINT-PÈRES", "SCI 29 HAUSSMANN", "S.C.I. DU SIÈGE", "SOGE IMMOBILIER PARTICIPATIONS"):
        rel, reason = classify_subsidiary(name)
        assert rel == "noise", name
        assert reason


def test_holdings_and_gie_are_noise():
    assert classify_subsidiary("SG HOLDING FONCIÈRE")[0] == "noise"
    assert classify_subsidiary("SOGE PARTICIPATIONS")[0] == "noise"
    assert classify_subsidiary("GIE COMMERC C C BOIS ST PERES")[0] == "noise"


def test_empty_or_illegible_name_is_noise():
    assert classify_subsidiary("")[0] == "noise"
    assert classify_subsidiary("   ")[0] == "noise"
    assert classify_subsidiary("X")[0] == "noise"


def test_partition_splits_and_annotates():
    out = partition_subsidiaries(SG_SUBS)
    meaningful_names = [s["name"] for s in out["meaningful"]]
    assert "BOURSORAMA" in meaningful_names
    assert "SOCIÉTÉ DE BOURSE GILBERT DUPONT" in meaningful_names
    assert all("SCI" not in n for n in meaningful_names)

    # Counts are honest: 3 operating, the rest filtered.
    assert out["summary"]["total"] == 9
    assert out["summary"]["meaningful"] == 3
    assert out["summary"]["filtered"] == 6
    # Breakdown explains *why* each was dropped.
    assert out["summary"]["filteredReasons"]  # non-empty

    # Each input subsidiary is annotated in place (non-destructive view).
    annotated = {s["name"]: s for s in out["annotated"]}
    assert annotated["BOURSORAMA"]["relevance"] == "operating"
    assert annotated["SCI SAINT-PÈRES"]["relevance"] == "noise"
    assert annotated["SCI SAINT-PÈRES"]["relevanceReason"]


def test_partition_handles_empty_list():
    out = partition_subsidiaries([])
    assert out["meaningful"] == []
    assert out["summary"]["total"] == 0
    assert out["summary"]["filtered"] == 0


def test_it_entity_overrides_the_gie_noise_rule():
    # A "GIE Informatique" is the ESN's #1 target — it must NOT be filtered as
    # internal-group noise the way a plain GIE is. (Crédit Mutuel → GICM.)
    assert classify_subsidiary("GIE Informatique CM") == ("operating", "")
    assert classify_subsidiary("Euro-Information") == ("operating", "")
    assert classify_subsidiary("Crédit Agricole Technologies & Services")[0] == "operating"
    # A non-IT GIE stays noise.
    assert classify_subsidiary("GIE COMMERC C C BOIS ST PERES")[0] == "noise"


def test_out_of_sector_by_name_is_not_operating():
    # Matteo's "plus gros pépin": SGTM (Société Générale des Travaux du Maroc,
    # BTP), les moulins du Togo — non-IT, non-bancaire → hors-scope, PAS un play.
    for name in (
        "SOCIETE GENERALE DES TRAVAUX DU MAROC",
        "SGTM Travaux Maroc",
        "Les Grands Moulins du Togo",
        "SOGEA BATIMENT SUD",
        "SG Construction",
    ):
        rel, reason = classify_subsidiary(name)
        assert rel == "out_of_sector", (name, rel)
        assert reason


def test_it_name_overrides_out_of_sector():
    # An IT/digital name inside a BTP-ish group stays a sellable target.
    assert classify_subsidiary("Construction Numérique & Data")[0] == "operating"


def test_out_of_sector_by_naf_prefix():
    # Registry NAF is authoritative when present: 43.xx = construction.
    rel, reason = classify_entity_relevance("Entité Ambiguë", naf="4399C")
    assert rel == "out_of_sector"
    assert reason
    # IT NAF (62.0x / 63.11) overrides the name/sector guess.
    assert classify_entity_relevance("Entité Ambiguë", naf="6201Z")[0] == "operating"


# ── Target-aware out-of-sector: spare the group's OWN core business ────────────


def test_derive_in_scope_families_from_entity_count():
    # A construction group has SEVERAL BTP-named subs → the BTP family is its core.
    vinci_subs = ["TRANSMANCHE CONSTRUCTION", "GESTION CONSTRUCTION SERVICES", "VINCI ENERGIES", "SCI DÉFENSE"]
    assert "btp" in derive_in_scope_families(naf="70.10Z", entity_names=vinci_subs)
    # A bank matches no excluded family → nothing spared.
    assert derive_in_scope_families(naf="64.19Z", entity_names=["BOURSORAMA", "SG SECURITIES"]) == frozenset()


def test_bank_with_construction_in_objet_social_does_NOT_spare_its_btp_sub():
    # Red-team regression: the gate must NOT key off free text. A bank whose objet
    # social says "financement de la construction" but has a SINGLE stray BTP sub
    # (SGTM) → btp NOT in-scope → SGTM stays out_of_sector.
    sg_subs = ["BOURSORAMA", "SG SECURITIES SERVICES", "SGTM Travaux Maroc", "SG HOLDING"]
    fams = derive_in_scope_families(naf="64.19Z", entity_names=sg_subs)
    assert "btp" not in fams  # one BTP name among banking subs → below the ≥2 core threshold
    assert classify_entity_relevance("SGTM Travaux Maroc", in_scope_families=fams)[0] == "out_of_sector"


def test_btp_arm_of_a_construction_group_stays_operating():
    fams = derive_in_scope_families(entity_names=["VINCI CONSTRUCTION", "SOGEA TRAVAUX", "EUROVIA"])
    assert classify_entity_relevance("VINCI Construction", in_scope_families=fams)[0] == "operating"
    assert classify_entity_relevance("VINCI Construction Grands Projets", in_scope_families=fams)[0] == "operating"
    # Registry NAF path is spared too when the family is the group's core.
    assert classify_entity_relevance("Filiale BTP", naf="4120A", in_scope_families=fams)[0] == "operating"


def test_off_core_btp_sub_under_a_bank_still_filtered():
    # A single BTP name among banking subs → NO family in scope → excluded.
    fams = derive_in_scope_families(naf="64.19Z", entity_names=["BOURSORAMA", "SGTM Travaux"])
    assert classify_entity_relevance("SGTM Travaux Maroc", in_scope_families=fams)[0] == "out_of_sector"
    # A construction group being in-scope for BTP does NOT spare agri noise.
    btp_only = derive_in_scope_families(entity_names=["VINCI CONSTRUCTION", "SOGEA TRAVAUX"])
    assert classify_entity_relevance("Les Grands Moulins du Togo", in_scope_families=btp_only)[0] == "out_of_sector"


def test_partition_spares_core_sector_subsidiaries():
    subs = [
        {"siren": "1", "name": "VINCI Construction Grands Projets"},
        {"siren": "2", "name": "SOGEA TRAVAUX"},
        {"siren": "3", "name": "SCI Nanterre Défense"},  # still real-estate noise
    ]
    fams = derive_in_scope_families(entity_names=[s["name"] for s in subs])
    out = partition_subsidiaries(subs, fams)
    by_name = {s["name"]: s["relevance"] for s in out["annotated"]}
    assert by_name["VINCI Construction Grands Projets"] == "operating"
    assert by_name["SCI Nanterre Défense"] == "noise"


def test_operating_entities_unchanged_by_out_of_sector_rules():
    for name in ("BOURSORAMA", "SOCIÉTÉ GÉNÉRALE SECURITIES SERVICES", "ALD AUTOMOTIVE"):
        assert classify_subsidiary(name)[0] == "operating"


def test_gets_play_only_for_operating():
    assert gets_play("operating") is True
    assert gets_play("noise") is False
    assert gets_play("out_of_sector") is False


def test_annotate_entity_relevance_tags_and_gates():
    # isItEntity (set upstream by NAF enrichment) forces operating.
    it_ent = annotate_entity_relevance({"name": "Opaque Holdco", "isItEntity": True})
    assert it_ent["relevance"] == "operating"
    assert it_ent["getsPlay"] is True

    btp = annotate_entity_relevance({"name": "SGTM Travaux", "nafCode": "4120A"})
    assert btp["relevance"] == "out_of_sector"
    assert btp["getsPlay"] is False
    assert btp["relevanceReason"]
    # Non-destructive: original fields survive.
    assert btp["name"] == "SGTM Travaux"


def test_out_of_sector_subs_filtered_from_meaningful():
    out = partition_subsidiaries(
        [
            {"siren": "1", "name": "SGTM Travaux Maroc"},
            {"siren": "2", "name": "BOURSORAMA"},
        ]
    )
    names = [s["name"] for s in out["meaningful"]]
    assert "BOURSORAMA" in names
    assert "SGTM Travaux Maroc" not in names
    by_name = {s["name"]: s for s in out["annotated"]}
    assert by_name["SGTM Travaux Maroc"]["relevance"] == "out_of_sector"


def test_partition_flags_it_entities():
    out = partition_subsidiaries(
        [
            {"siren": "1", "name": "Euro-Information"},
            {"siren": "2", "name": "SCI Saint-Pères"},
            {"siren": "3", "name": "BOURSORAMA"},
        ]
    )
    by_name = {s["name"]: s for s in out["annotated"]}
    assert by_name["Euro-Information"]["isItEntity"] is True
    assert by_name["Euro-Information"]["relevance"] == "operating"
    assert by_name["SCI Saint-Pères"]["isItEntity"] is False
    assert by_name["BOURSORAMA"]["isItEntity"] is False
    # The IT entity is in the sellable cartography.
    assert "Euro-Information" in [s["name"] for s in out["meaningful"]]


# ── Entity qualification type + actionable (Théo restitution p.6) ─────────────
# "Chaque entité doit porter un type : BU, marque, filiale stratégique, SPV,
# cédée, homonyme, bruit. Par défaut, affiche uniquement les entités actionnables."


def test_spv_financing_vehicle_is_non_actionable():
    # Théo : "2009 KOALA FINANCE" / SPV / MSN numbers polluaient le run SG.
    for name in ("2009 KOALA FINANCE", "2011 GAZELLE FUNDING", "SG MSN 42", "FCT RED & BLACK"):
        t, actionable = classify_entity_type(name, relevance="noise")
        assert t == "SPV", (name, t)
        assert actionable is False
    # And the relevance gate itself demotes them (so getsPlay=False, no play):
    for name in ("2009 KOALA FINANCE", "FCT RED & BLACK", "SG COMPARTIMENT 3"):
        rel, reason = classify_entity_relevance(name)
        assert rel == "noise", (name, rel)
        assert "SPV" in reason or "financement" in reason


def test_spv_gate_does_not_catch_operating_finance_arms():
    # Regression guard: covered-bond issuer + securities services stay operating.
    assert classify_entity_relevance("Société Générale SFH")[0] == "operating"
    assert classify_entity_relevance("SOCIÉTÉ GÉNÉRALE SECURITIES SERVICES")[0] == "operating"
    assert classify_entity_relevance("SG Capital Partners")[0] == "operating"  # no year prefix


def test_divested_entity_is_cedee_and_non_actionable():
    for name in ("Filiale Truc (cédée)", "Ex-filiale Machin", "Activité Bidule cession 2022"):
        t, actionable = classify_entity_type(name, relevance="operating")
        assert t == "cedee", (name, t)
        assert actionable is False
    # The relevance gate marks it out-of-scope too (no play).
    assert classify_entity_relevance("Ancienne filiale Digital")[0] == "out_of_sector"


def test_sector_mismatch_is_homonyme():
    # A cross-sector-family entity carrying the group name → probable homonyme.
    t, actionable = classify_entity_type(
        "Société Générale de Travaux",
        relevance="out_of_sector",
        relevance_reason="hors secteur (BTP / travaux)",
    )
    assert t == "homonyme"
    assert actionable is False


def test_geo_out_of_scope_is_noise_not_homonyme():
    # A real foreign sub (SGTM au Maroc) is off-perimeter noise, NOT a homonyme.
    t, actionable = classify_entity_type(
        "SGTM Travaux Maroc",
        relevance="out_of_sector",
        relevance_reason="hors périmètre géographique (international)",
    )
    assert t == "bruit"
    assert actionable is False


def test_in_scope_subsidiary_is_actionable():
    # A plain operating entity is actionable; a BU keeps its structural badge.
    assert classify_entity_type("BOURSORAMA", relevance="operating") == ("operational", True)
    assert classify_entity_type("SG Retail", relevance="operating", structural_type="BU") == ("BU", True)


def test_it_arm_is_strategic_and_actionable():
    t, actionable = classify_entity_type("Euro-Information", relevance="operating", is_it_entity_flag=True)
    assert t == "filiale_strategique"
    assert actionable is True
    # Name-based IT signal alone is enough.
    assert classify_entity_type("SG Digital Factory", relevance="operating")[0] == "filiale_strategique"


def test_annotate_stamps_type_and_actionable():
    it_ent = annotate_entity_relevance({"name": "Opaque Holdco", "isItEntity": True})
    assert it_ent["type"] == "filiale_strategique"
    assert it_ent["actionable"] is True

    spv = annotate_entity_relevance({"name": "2009 KOALA FINANCE"})
    assert spv["type"] == "SPV"
    assert spv["actionable"] is False
    assert spv["getsPlay"] is False  # actionable stays consistent with the play gate

    op = annotate_entity_relevance({"name": "BOURSORAMA", "type": "BU"})
    assert op["type"] == "BU"  # structural label preserved for actionable entities
    assert op["actionable"] is True


def test_partition_stamps_type_and_actionable():
    out = partition_subsidiaries(
        [
            {"siren": "1", "name": "2009 KOALA FINANCE"},
            {"siren": "2", "name": "BOURSORAMA"},
            {"siren": "3", "name": "SCI Saint-Pères"},
        ]
    )
    by_name = {s["name"]: s for s in out["annotated"]}
    assert by_name["2009 KOALA FINANCE"]["type"] == "SPV"
    assert by_name["2009 KOALA FINANCE"]["actionable"] is False
    assert by_name["BOURSORAMA"]["actionable"] is True
    assert by_name["SCI Saint-Pères"]["type"] == "bruit"
    assert by_name["SCI Saint-Pères"]["actionable"] is False
    # SPV never reaches the sellable cartography.
    assert "2009 KOALA FINANCE" not in [s["name"] for s in out["meaningful"]]


def test_actionable_is_consistent_with_gets_play():
    # actionable must never contradict the play gate (regression invariant).
    for name in ("BOURSORAMA", "2009 KOALA FINANCE", "SCI Saint-Pères", "SGTM Travaux Maroc", "Euro-Information"):
        ann = annotate_entity_relevance({"name": name})
        assert ann["actionable"] == ann["getsPlay"], name
