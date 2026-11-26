"""Relance ciblée par thème (retour Thales 2026-07-07).

Théo : l'utilisateur doit pouvoir relancer une recherche contacts ciblée sur un
thème (TDSI, cortAIx, achats, MLOps, DSI France, cyber…) SANS relancer tout le
compte. ``resolve_theme_scope`` traduit un thème en scope Apollo (titles /
seniorities / geographies) réutilisable par le ré-run scopé existant (ContactScope
+ endpoint enrich-contacts).
"""

from __future__ import annotations

from app.services.contact_themes import (
    THEME_DICTIONARY_VERSION,
    THEME_PRESETS,
    resolve_theme_scope,
    theme_coverage,
    theme_relaunch_candidates,
    theme_title_match,
)


def test_cyber_theme_targets_security_titles() -> None:
    scope = resolve_theme_scope("cyber")
    joined = " ".join(scope["titles"]).lower()
    assert "rssi" in joined or "ciso" in joined or "sécurité" in joined


def test_achats_theme_targets_procurement() -> None:
    scope = resolve_theme_scope("achats")
    joined = " ".join(scope["titles"]).lower()
    assert "achat" in joined or "procurement" in joined
    assert scope["seniorities"]  # a procurement search is scoped by seniority


def test_dsi_france_adds_geography() -> None:
    scope = resolve_theme_scope("DSI France")
    joined = " ".join(scope["titles"]).lower()
    assert "dsi" in joined or "systèmes d'information" in joined
    assert scope["geographies"] == ["France"]


def test_data_synonyms_map_to_data_titles() -> None:
    for theme in ("MLOps", "cortAIx", "data", "IA"):
        scope = resolve_theme_scope(theme)
        joined = " ".join(scope["titles"]).lower()
        assert "data" in joined or "ia" in joined or "ai" in joined, theme


def test_unknown_theme_falls_back_to_raw_title() -> None:
    scope = resolve_theme_scope("Robotique industrielle")
    assert scope["titles"] == ["Robotique industrielle"]
    assert scope["geographies"] == []


def test_presets_are_well_formed() -> None:
    assert THEME_PRESETS
    for preset in THEME_PRESETS.values():
        assert preset["titles"]


# ── #2290.1 — synonymes/acronymes/associations sectorielles/exclusions ──────


def test_presets_carry_acronyms_sector_associations_and_exclusions() -> None:
    """2290.1 : chaque preset porte désormais ses acronymes, ses associations
    sectorielles réelles et ses faux amis EXPLICITEMENT, pas seulement des
    synonymes en vrac."""
    for preset in THEME_PRESETS.values():
        assert isinstance(preset["acronyms"], set)
        assert isinstance(preset["sector_associations"], dict)
        assert isinstance(preset["exclusions"], set)
    # Au moins une famille porte chaque dimension nouvelle (pas fictif : ce sont
    # des acronymes/associations réels, cf. docstring du module).
    assert THEME_PRESETS["cyber"]["acronyms"] >= {"rssi", "ciso", "soc", "ssi"}
    assert "cesin" in THEME_PRESETS["cyber"]["sector_associations"]
    assert THEME_PRESETS["dsi"]["exclusions"]


# ── #2290.9 — dictionnaire versionné ─────────────────────────────────────────


def test_dictionary_is_versioned() -> None:
    assert THEME_DICTIONARY_VERSION
    scope = resolve_theme_scope("cyber")
    assert scope["match"]["dictionaryVersion"] == THEME_DICTIONARY_VERSION


# ── #2290.4/.5/.6 — terme direct, synonymie, famille ─────────────────────────


def test_match_reports_direct_term_and_family() -> None:
    scope = resolve_theme_scope("cyber")
    assert scope["match"]["family"] == "cyber"
    assert scope["match"]["matchedTerm"] == "cyber"
    assert scope["match"]["matchedVia"] == "direct"
    assert scope["match"]["widened"] is False


def test_match_reports_synonym_used() -> None:
    scope = resolve_theme_scope("cortAIx")
    assert scope["match"]["family"] == "data"
    assert scope["match"]["matchedTerm"] == "cortaix"
    assert scope["match"]["matchedVia"] == "synonym"


def test_match_reports_acronym_used() -> None:
    scope = resolve_theme_scope("RSSI")
    assert scope["match"]["family"] == "cyber"
    assert scope["match"]["matchedTerm"] == "rssi"
    assert scope["match"]["matchedVia"] == "acronym"


# ── #2290.7 — association sectorielle ────────────────────────────────────────


def test_match_reports_sector_association() -> None:
    scope = resolve_theme_scope("CIGREF")
    assert scope["match"]["family"] == "dsi"
    assert scope["match"]["matchedVia"] == "sector_association"
    assert scope["match"]["sectorAssociation"] == "CIGREF — Club Informatique des Grandes Entreprises Françaises"


# ── faux amis (2290.1) — une exclusion empêche le match, jamais un plus ─────


def test_exclusion_prevents_false_family_match() -> None:
    scope = resolve_theme_scope("agent de sécurité")
    assert scope["match"]["family"] is None
    assert scope["match"]["matchedVia"] == "raw_fallback"
    assert scope["match"]["excludedAsFauxAmi"] == "cyber"
    # Le faux ami est écarté, pas remplacé par une famille inventée.
    assert scope["titles"] == ["agent de sécurité"]


def test_unknown_theme_never_guesses_a_family() -> None:
    scope = resolve_theme_scope("Robotique industrielle")
    assert scope["match"]["family"] is None
    assert scope["match"]["matchedVia"] == "raw_fallback"


# ── #2532.2 — un métier hors informatique doit trouver un périmètre non vide
# et pertinent, pas juste le mot-clé brut (retour client 17/09/2026,
# « Coordinateur de chantier », recherche de contacts revenue bredouille) ────


def test_unknown_non_it_job_title_expands_to_gender_variant() -> None:
    """Avant #2532.2 : un thème hors IT retombait sur UN SEUL mot-clé littéral,
    sans expansion — un périmètre de recherche trop étroit pour un métier
    absent des presets. La règle générique (suffixes masculin/féminin
    français, pas une liste de métiers) élargit ce périmètre pour N'IMPORTE
    QUEL métier encore hors des 10 presets (ici : éducation/formation, une
    famille que ce lot n'ajoute PAS — voir #2532.2 21/09 pour le BTP, devenu
    un preset nommé, testé séparément ci-dessous)."""
    scope = resolve_theme_scope("Coordinateur pédagogique")
    titles_lower = [t.lower() for t in scope["titles"]]
    assert "coordinateur pédagogique" in titles_lower
    # Le périmètre n'est plus réduit au seul mot-clé littéral saisi.
    assert len(scope["titles"]) >= 2
    assert "coordinatrice pédagogique" in titles_lower
    # La variante sert à TROUVER, jamais à classer : aucun champ de tri ici.
    assert scope["match"]["family"] is None


# ── #2532.2 (21/09/2026) — REVIREMENT : « Coordinateur de chantier » rejoint
# maintenant un preset NOMMÉ (btp), plus riche que la seule variante de genre
# testée ci-dessus pour un métier encore non couvert. Documente le changement
# de comportement plutôt que de le laisser silencieux (voir docstring de tête
# de module + registre cité). ────────────────────────────────────────────


def test_btp_family_now_covers_the_bouygues_incident_term() -> None:
    scope = resolve_theme_scope("Coordinateur de chantier")
    assert scope["match"]["family"] == "btp"
    assert scope["match"]["matchedVia"] == "synonym"
    assert scope["match"]["matchedTerm"] == "chantier"
    titles_lower = [t.lower() for t in scope["titles"]]
    assert "chef de chantier" in titles_lower
    assert "conducteur de travaux" in titles_lower


def test_btp_theme_targets_construction_titles() -> None:
    scope = resolve_theme_scope("BTP")
    joined = " ".join(scope["titles"]).lower()
    assert "travaux" in joined or "chantier" in joined
    assert scope["seniorities"]


def test_btp_sector_association_ffb() -> None:
    scope = resolve_theme_scope("FFB")
    assert scope["match"]["family"] == "btp"
    assert scope["match"]["matchedVia"] == "sector_association"
    assert scope["match"]["sectorAssociation"] == "FFB — Fédération Française du Bâtiment"


def test_ingenierie_theme_targets_industrial_titles() -> None:
    scope = resolve_theme_scope("industrie")
    joined = " ".join(scope["titles"]).lower()
    assert "industriel" in joined or "méthodes" in joined or "production" in joined


def test_ingenierie_excludes_financial_engineering_false_friend() -> None:
    # "ingénierie financière" est un métier FINANCE, jamais un bureau d'études
    # industriel — faux ami identifié pour la famille "ingenierie".
    scope = resolve_theme_scope("ingénierie financière")
    assert scope["match"]["family"] is None
    assert scope["match"]["excludedAsFauxAmi"] == "ingenierie"


def test_sante_theme_targets_medical_titles() -> None:
    scope = resolve_theme_scope("hospitalier")
    joined = " ".join(scope["titles"]).lower()
    assert "médical" in joined or "soins" in joined or "santé" in joined


def test_sante_excludes_health_insurance_false_friend() -> None:
    # "assurance santé" est un produit finance/assurance, jamais un rôle de
    # prestataire de soin — faux ami identifié pour la famille "sante". Le
    # thème retombe légitimement sur "finance" (synonyme "assurance"), jamais
    # sur "sante" : l'exclusion protège la bonne famille de la mauvaise, elle
    # ne rend pas le thème inconnu quand une autre famille le reconnaît.
    scope = resolve_theme_scope("Responsable Assurance Santé")
    assert scope["match"]["family"] != "sante"
    assert scope["match"]["family"] == "finance"


def test_energie_theme_targets_energy_titles() -> None:
    scope = resolve_theme_scope("EnR")
    assert scope["match"]["family"] == "energie"
    assert scope["match"]["matchedVia"] == "acronym"
    joined = " ".join(scope["titles"]).lower()
    assert "énergie" in joined


def test_finance_theme_targets_insurance_and_finance_titles() -> None:
    scope = resolve_theme_scope("assurance")
    assert scope["match"]["family"] == "finance"
    joined = " ".join(scope["titles"]).lower()
    assert "assurance" in joined or "actuaire" in joined or "risques" in joined


def test_finance_excludes_quality_assurance_false_friend() -> None:
    # "assurance qualité" (démarche qualité) n'a aucun rapport avec le produit
    # financier — faux ami identifié pour la famille "finance".
    scope = resolve_theme_scope("Responsable Assurance Qualité")
    assert scope["match"]["family"] is None
    assert scope["match"]["excludedAsFauxAmi"] == "finance"


def test_the_five_non_it_families_carry_real_sourced_content() -> None:
    """Chaque famille ajoutée le 21/09 porte au moins une association
    sectorielle RÉELLE et un faux ami RÉEL nommément identifié — jamais un
    ensemble vide fictif « pour faire nombre »."""
    for family in ("ingenierie", "btp", "sante", "finance"):
        preset = THEME_PRESETS[family]
        assert preset["sector_associations"], family
        assert preset["exclusions"], family
    # "energie" n'a aucun faux ami identifié — assumé vide (même règle que
    # "data"/"cloud"), mais porte deux associations sectorielles réelles.
    assert len(THEME_PRESETS["energie"]["sector_associations"]) >= 2


# ── #2290.2 — couverture des thèmes après une recherche générale ────────────


def test_coverage_reports_covered_and_not_covered_families() -> None:
    seeds = [{"title": "RSSI"}, {"title": "Directeur des Achats"}]
    coverage = theme_coverage(seeds)
    assert coverage["families"]["cyber"]["status"] == "couverte_tete"
    assert coverage["families"]["achats"]["status"] == "couverte_tete"
    assert coverage["families"]["cloud"]["status"] == "non_couverte"
    assert coverage["families"]["cloud"]["matchedTitles"] == []
    # 10 presets depuis #2532.2 (21/09/2026) : 5 IT + 5 hors IT (ingénierie,
    # BTP, santé, énergie, finance) — measured = covered + not_covered sur
    # TOUS les presets, pas seulement les 5 historiques.
    assert coverage["measured"] == len(THEME_PRESETS)
    assert coverage["dictionaryVersion"] == THEME_DICTIONARY_VERSION


def test_coverage_never_reads_as_zero_when_search_failed() -> None:
    """GA-18/GA-19 : une recherche VIDE (panne Apollo, pas « le marché n'a
    personne ») ne doit jamais se lire comme 0 famille couverte — chaque
    famille reste `non_mesure` et sort du dénominateur `measured`."""
    coverage = theme_coverage([])
    assert coverage["measured"] == 0
    for info in coverage["families"].values():
        assert info["status"] == "non_mesure"
        assert info["status"] != "non_couverte"


def test_coverage_measures_what_we_know_not_the_market() -> None:
    """GA-259 : une couverture ne prétend jamais parler du marché — seulement
    de ce que CETTE recherche a su trouver."""
    coverage = theme_coverage([{"title": "RSSI"}])
    # Aucun champ de la structure ne prétend décrire l'effectif réel du client.
    assert set(coverage.keys()) == {"families", "dictionaryVersion", "measured", "covered", "headCovered", "notCovered"}


# ── #2290.3 — relance ciblée sur une famille insuffisamment couverte ────────


def test_relaunch_candidates_are_the_not_covered_families_only() -> None:
    coverage = theme_coverage([{"title": "RSSI"}])
    candidates = theme_relaunch_candidates(coverage)
    assert "cyber" not in candidates
    assert "data" in candidates
    assert "achats" in candidates


def test_relaunch_never_targets_a_non_measured_family() -> None:
    """Une famille `non_mesure` (recherche vide) n'est jamais candidate à la
    relance : on ne sait rien d'elle, ce n'est pas un zéro constaté."""
    coverage = theme_coverage([])
    assert theme_relaunch_candidates(coverage) == []


# ── #2532.2 bis — un contact de repli SANS rapport avec le thème ne doit pas
# lui être attribué (retour BOUYGUES CONSTRUCTION, 19/09/2026, #2532.2
# réfuté en prod le 19/09) ───────────────────────────────────────────────


def test_theme_title_match_recognises_a_matching_title() -> None:
    # #2532.2 (21/09) — "Coordinateur de chantier" matche désormais le preset
    # "btp" (voir test_btp_family_now_covers_the_bouygues_incident_term) :
    # le titre à reconnaître est un des titres CURATÉS du preset, pas la
    # variante de genre du mot-clé saisi.
    scope = resolve_theme_scope("Coordinateur de chantier")
    assert theme_title_match("Chef de Chantier Grand Paris", scope) is True


def test_theme_title_match_recognises_a_gender_variant_for_an_uncovered_theme() -> None:
    # Le mécanisme d'origine (#2532.2 bis) reste vrai pour un métier encore
    # hors des 10 presets.
    scope = resolve_theme_scope("Coordinateur pédagogique")
    assert theme_title_match("Coordinatrice pédagogique Île-de-France", scope) is True


def test_theme_title_match_rejects_an_unrelated_title() -> None:
    scope = resolve_theme_scope("Coordinateur de chantier")
    assert theme_title_match("Directeur Financier", scope) is False


def test_theme_title_match_is_false_without_a_title() -> None:
    scope = resolve_theme_scope("cyber")
    assert theme_title_match(None, scope) is False
    assert theme_title_match("", scope) is False
