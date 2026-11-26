"""#4732 rachat/fusion et #4733 recrutement COO/CFO : signaux typés, datés, prouvés."""

from app.services.dated_signals import merge_collector_signals
from app.services.hierarchy_level import is_executive_recruitment_title
from app.services.signal_layers import classify_signal_category, commercial_implication, layer_signals
from app.services.signal_freshness import stamp_signals_freshness


class TestRecrutementDeDirigeant:
    def test_les_intitules_de_direction_sont_reconnus(self):
        for title in (
            "COO H/F",
            "Chief Operating Officer",
            "CFO - Directeur Financier",
            "Directeur des Opérations",
            "Directrice des opérations",
            "Directeur Administratif et Financier",
            "DAF",
            "Directeur Financier Groupe",
            "Chief Financial Officer",
        ):
            assert is_executive_recruitment_title(title), title

    def test_un_poste_subalterne_ou_muet_nest_pas_un_dirigeant(self):
        for title in ("Comptable", "Assistant de direction financière", "Développeur", "Responsable paie", "", None):
            assert not is_executive_recruitment_title(title), title

    def test_loffre_de_dirigeant_porte_son_intitule_reel_et_un_drapeau(self):
        jobs = [{"title": "Directeur des Opérations H/F", "date": "2026-10-20", "url": "https://x.example/o1"}]
        out = merge_collector_signals([], jobs=jobs)
        assert out[0]["signal"] == "Directeur des Opérations H/F"
        assert out[0]["executive_role"] is True

    def test_une_offre_ordinaire_ne_porte_pas_le_drapeau(self):
        out = merge_collector_signals([], jobs=[{"title": "Développeur Java", "date": "2026-10-20"}])
        assert "executive_role" not in out[0]

    def test_la_categorie_dirigeant_passe_avant_recrutement(self):
        sig = {"signal": "CFO H/F", "type": "recrutement", "executive_role": True}
        assert classify_signal_category(sig) == "recrutement_dirigeant"
        assert classify_signal_category({"signal": "Développeur", "type": "recrutement"}) == "recrutement"

    def test_limplication_du_dirigeant_nest_pas_vide(self):
        imp = commercial_implication({"signal": "COO", "type": "recrutement", "executive_role": True})
        assert imp["category"] == "recrutement_dirigeant"
        assert imp["impact"] and imp["who"] and imp["action"]


class TestRachatEtFusion:
    def test_la_vente_du_greffe_est_une_acquisition_datee_de_la_publication(self):
        legal = [{"date": "2026-09-12", "type": "Vente et cession", "label": "Cession de fonds", "url": "https://b.example/1"}]
        out = merge_collector_signals([], legal=legal)
        assert out[0]["type"] == "acquisition"
        assert out[0]["date"] == "2026-09-12"
        assert out[0]["url"] == "https://b.example/1"

    def test_une_modification_qui_nomme_une_fusion_devient_acquisition(self):
        legal = [{"date": "2026-08-03", "type": "Modification", "label": "Fusion-absorption de la société X"}]
        out = merge_collector_signals([], legal=legal)
        assert [s["type"] for s in out] == ["acquisition"]

    def test_une_modification_administrative_ne_fait_aucun_signal_acquisition(self):
        legal = [{"date": "2026-08-03", "type": "Modification", "label": "Changement d'adresse"}]
        out = merge_collector_signals([], legal=legal)
        assert all(s["type"] != "acquisition" for s in out)

    def test_une_date_en_toutes_lettres_nest_pas_lue_premier_janvier(self):
        legal = [{"date": "12 septembre 2026", "type": "Vente et cession", "label": "Cession"}]
        assert merge_collector_signals([], legal=legal) == []

    def test_rachat_en_toutes_lettres_est_une_categorie_rachat_fusion(self):
        for text in ("Rachat de la société Y annoncé", "Fusion de deux groupes", "Acquisition de Z", "OPA sur Z", "Absorption de Z"):
            assert classify_signal_category({"signal": text}) == "rachat_fusion", text
        assert classify_signal_category({"signal": "x", "type": "acquisition"}) == "rachat_fusion"

    def test_rachat_ne_devient_pas_un_recrutement_ni_une_organisation(self):
        imp = commercial_implication({"signal": "Rachat de Y et recrutement de 30 personnes"})
        assert imp["category"] == "rachat_fusion"

    def test_un_rachat_de_2024_est_historique_pas_supprime(self):
        stamped = stamp_signals_freshness([
            {"signal": "Rachat de Y", "type": "acquisition", "date": "2024-01-10"},
            {"signal": "Rachat de Z", "type": "acquisition", "date": "2026-09-10"},
        ])
        layers = layer_signals(stamped)
        assert [s["signal"] for s in layers["visible"]] == ["Rachat de Z"]
        assert layers["counts"]["total"] == 2
