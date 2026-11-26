"""#4923 (Louis 30/10/2026) — contacts & organigramme : ciblage piloté par la demande,
taxonomie élargie, couverture « tête », relance."""

from __future__ import annotations

from types import SimpleNamespace

from app.services.contact_themes import (
    BUYING_COMMITTEE_FAMILIES,
    THEME_DICTIONARY_VERSION,
    THEME_PRESETS,
    family_head_scope,
    target_families,
    theme_coverage,
    theme_relaunch_candidates,
)


def _scope(**kw):
    base = {"theme": None, "family": None, "titles": []}
    base.update(kw)
    return SimpleNamespace(**base)


# ── #4923.1 — target_families
def test_socle_comite_achat_toujours_present() -> None:
    families = target_families({}, None, None)
    for fam in BUYING_COMMITTEE_FAMILIES:
        assert fam in families


def test_profil_data_cible_data_et_voisines() -> None:
    families = target_families({"offers": ["MLOps et data engineering"]}, None, None)
    assert families[0] == "data"
    assert "cloud" in families


def test_secteur_assurance_ajoute_les_familles_metier() -> None:
    families = target_families({}, None, "Assurance")
    assert "assurance" in families and "juridique_conformite" in families


def test_secteur_industrie_ajoute_production_qualite_supply() -> None:
    families = target_families({}, None, "industrie")
    for fam in ("industrie_production", "qualite_qhse", "supply_chain"):
        assert fam in families


def test_scope_explicite_gagne_mais_le_socle_reste() -> None:
    families = target_families({"offers": ["data"]}, _scope(theme="cyber"), None)
    assert families[0] == "cyber"
    assert "achats" in families  # le socle reste


def test_titres_poses_par_l_utilisateur_ne_sont_pas_elargis() -> None:
    assert target_families({"offers": ["data"]}, _scope(titles=["Directeur X"]), "assurance") == []


def test_secteur_inconnu_n_invente_rien() -> None:
    assert target_families({}, None, "spatial lunaire") == list(BUYING_COMMITTEE_FAMILIES)


def test_pure_et_deterministe() -> None:
    args = ({"personas": ["DSI"]}, None, "retail")
    assert target_families(*args) == target_families(*args)


# ── #4923.3 / .4 / .5 — taxonomie
def test_chaque_famille_a_25_titres_et_des_roles_de_tete() -> None:
    for name, preset in THEME_PRESETS.items():
        assert len(preset["titles"]) >= 25, name
        assert preset["head_titles"], name
        assert set(preset["head_titles"]) <= set(preset["titles"]), name


def test_titres_fr_et_en_dans_data() -> None:
    titles = " | ".join(THEME_PRESETS["data"]["titles"])
    assert "Head of AI" in titles and "Directeur Data & IA" in titles and "Directrice Data" in titles


def test_familles_sectorielles_presentes() -> None:
    for fam in (
        "assurance",
        "retail",
        "cosmetique_luxe",
        "industrie_production",
        "supply_chain",
        "qualite_qhse",
        "rd",
        "rh_sirh",
        "marketing_digital",
        "juridique_conformite",
    ):
        assert fam in THEME_PRESETS


def test_version_du_dictionnaire_bumpee() -> None:
    assert THEME_DICTIONARY_VERSION.startswith("2026-10-30")


# ── #4923.6 — couverture tête / partielle
def test_mlops_engineer_ne_couvre_plus_data_en_tete() -> None:
    cov = theme_coverage([{"title": "MLOps Engineer"}])
    assert cov["families"]["data"]["status"] == "couverte_partielle"


def test_head_of_data_couvre_data_en_tete() -> None:
    cov = theme_coverage([{"title": "Group Head of Data & Analytics"}])
    assert cov["families"]["data"]["status"] == "couverte_tete"
    assert cov["headCovered"] >= 1


def test_recherche_vide_reste_non_mesuree() -> None:
    cov = theme_coverage([])
    assert {f["status"] for f in cov["families"].values()} == {"non_mesure"}
    assert theme_relaunch_candidates(cov) == []


def test_famille_sans_tete_est_candidate_a_la_relance_dans_l_ordre_du_ciblage() -> None:
    cov = theme_coverage([{"title": "MLOps Engineer"}, {"title": "DSI"}])
    cands = theme_relaunch_candidates(cov, ["achats", "data", "dsi"])
    assert cands == ["achats", "data"]  # dsi a sa tête ; data n'a que du contributeur


def test_famille_hors_ciblage_n_est_pas_relancee() -> None:
    cov = theme_coverage([{"title": "DSI"}])
    assert "qualite_qhse" not in theme_relaunch_candidates(cov, ["achats"])


def test_family_head_scope_titres_de_tete_sans_seniorite() -> None:
    scope = family_head_scope("data")
    assert scope is not None and "Head of Data" in scope["titles"] and scope["seniorities"] == []
    assert family_head_scope("inconnue") is None
