"""#4646 — les offres qui ont fait SORTIR le compte de Découvrir arrivent dans le dossier, datées, et ne disparaissent pas."""

from app.services.discover_carried_offers import (
    carried_offer_signals,
    carried_skills,
    carried_unfound_count,
    with_carried_offers,
)
from app.services.run_cadrage import explicit_request, explicit_terms

HYP = {
    "discover_origin_skills": ["java", "vue"],
    "discover_origin_offers": [
        {"title": "Concepteur-développeur Java", "date": "2026-10-20", "seen": "2026-10-27"},
        {"title": "Développeur Vue.js", "date": "2026-10-18"},
    ],
}


def test_les_offres_de_decouvrir_sont_recopiees_datees_et_sourcees():
    rows = carried_offer_signals(HYP)
    assert [r["signal"]["date"] for r in rows] == ["2026-10-20", "2026-10-18"]
    first = rows[0]
    assert first["source"] == "discover" and first["fromDiscover"] is True
    assert first["signal"]["type"] == "hiring"
    assert "Concepteur-développeur Java" in first["signal"]["label"]
    assert first["signal"]["detail"] == "vue le 27/10 dans Découvrir"
    # sans date d'observation transmise : on ne l'invente pas, on dit la date de l'offre
    assert rows[1]["signal"]["detail"] == "offre du 18/10 relevée dans Découvrir"


def test_hors_decouvrir_rien_ne_change():
    assert carried_offer_signals(None) == []
    assert carried_offer_signals({"tier_label": "A"}) == []
    existing = [{"name": "X", "signal": {"label": "Recrutement — Dev"}}]
    assert with_carried_offers(existing, None) is existing
    assert carried_skills(None) == ()
    assert explicit_terms(None, ()) == ()


def test_le_rejeu_qui_retrouve_l_offre_ne_la_double_pas():
    found = [{"title": "Concepteur-développeur Java", "signal": {"label": "Recrutement — Concepteur-développeur Java"}}]
    merged = with_carried_offers(found, HYP)
    titles = [(r.get("title") or r["signal"]["label"]) for r in merged]
    assert len(merged) == 2 and titles.count("Concepteur-développeur Java") == 1
    assert merged[0]["signal"]["label"].endswith("Développeur Vue.js")  # la recopiée en tête, la trouvée est gardée


def test_le_rejeu_qui_ne_retrouve_rien_n_efface_pas():
    merged = with_carried_offers([], HYP)
    assert len(merged) == 2


def test_les_competences_cherchees_entrent_dans_la_cascade():
    assert carried_skills(HYP) == ("java", "vue")
    assert explicit_terms(None, ("java", "vue")) == ("java", "vue")
    assert explicit_terms({"selected_angles": ["cyber"]}, ("java", "cyber")) == ("cyber", "java")
    assert explicit_request(None) is False
    assert explicit_request(None, ("java",)) is True


def test_entrees_malformees_ignorees():
    bad = {"discover_origin_offers": [{"title": ""}, "x", {"date": "2026-01-01"}, {"title": "A", "date": "pas-une-date"}]}
    rows = carried_offer_signals(bad)
    assert len(rows) == 1 and rows[0]["signal"]["date"] is None


def test_le_lien_de_l_annonce_suit_l_offre_jamais_une_adresse_inventee():
    # #4646.2 — l'URL que la carte portait est reprise telle quelle ; ni http(s) ni absente = pas de lien.
    hyp = {
        "discover_origin_offers": [
            {"title": "Dev Java", "url": "https://offres.example.org/a"},
            {"title": "Dev Vue", "url": "javascript:alert(1)"},
            {"title": "Dev Go"},
        ]
    }
    urls = [r["signal"]["url"] for r in carried_offer_signals(hyp)]
    assert urls == ["https://offres.example.org/a", None, None]


def test_le_compteur_dit_combien_d_offres_de_decouvrir_la_collecte_n_a_pas_retrouvees():
    # #4646.7 — « found: 0 » alors que Découvrir en avait : le dossier dit combien viennent de Découvrir.
    assert carried_unfound_count([], HYP) == 2
    found = [{"title": "Concepteur-développeur Java", "signal": {"label": "Recrutement — Concepteur-développeur Java"}}]
    assert carried_unfound_count(found, HYP) == 1


def test_hors_decouvrir_le_compteur_est_nul():
    assert carried_unfound_count([], None) == 0
    assert carried_unfound_count([{"title": "X"}], {"tier_label": "A"}) == 0
