"""Signaux : fraîcheur, profondeur et implication (recette finale §25-26)."""

from app.services.signal_layers import (
    VISIBLE_SIGNALS,
    classify_signal_category,
    commercial_implication,
    layer_signals,
)
from app.services.signal_freshness import stamp_signals_freshness


def signal(text: str, date_str: str) -> dict:
    return {"signal": text, "date": date_str}


class TestUnArchiveNoccupePlusUnePlaceVisible:
    def test_le_signal_de_2021_descend_en_contexte_historique(self):
        # Le reproche exact : « Seulement 6 signaux, dont un ancien. » Une place
        # visible occupée par un fait de 2021 pendant qu'un fait récent attend.
        stamped = stamp_signals_freshness(
            [
                signal("Plan stratégique 2021-2025 annoncé", "2021-03-10"),
                signal("Résultats record Q2 2026, budget confirmé", "2026-07-30"),
            ]
        )
        layers = layer_signals(stamped)

        assert [s["signal"] for s in layers["visible"]] == ["Résultats record Q2 2026, budget confirmé"]
        assert [s["signal"] for s in layers["historical"]] == ["Plan stratégique 2021-2025 annoncé"]

    def test_larchive_nest_pas_supprimee_pour_autant(self):
        # Un plan stratégique de 2021 encore en cours est un contexte utile. Il
        # n'est simplement pas un déclencheur — deux choses différentes.
        stamped = stamp_signals_freshness([signal("Plan 2021-2025", "2021-03-10")])
        layers = layer_signals(stamped)
        assert layers["counts"]["total"] == 1
        assert len(layers["historical"]) == 1

    def test_au_dela_de_la_borne_on_garde_et_on_compte(self):
        # « Charger davantage en backend puis afficher les 8 plus pertinents,
        # avec Voir les autres » — collecter PLUS, montrer les meilleurs.
        stamped = stamp_signals_freshness([signal(f"Recrutement {i}", "2026-07-01") for i in range(12)])
        layers = layer_signals(stamped)

        assert len(layers["visible"]) == VISIBLE_SIGNALS
        assert len(layers["more"]) == 12 - VISIBLE_SIGNALS
        assert layers["counts"]["hidden"] == 12 - VISIBLE_SIGNALS


class TestLordreDeLecture:
    def test_un_budget_passe_devant_une_nomination(self):
        # Les deux comptent, pas dans le même ordre : un budget confirmé ouvre
        # une fenêtre d'achat, une nomination ouvre une porte.
        stamped = stamp_signals_freshness(
            [
                signal("Nomination d'une responsable Global Transactions", "2026-07-20"),
                signal("Budget IT confirmé pour la transformation data", "2026-07-18"),
            ]
        )
        layers = layer_signals(stamped)
        assert layers["visible"][0]["signal"].startswith("Budget")

    def test_un_signal_qui_parle_de_deux_choses_est_dabord_celle_qui_deplace_lachat(self):
        assert classify_signal_category({"signal": "Budget confirmé et recrutement de 20 ingénieurs"}) == "budget"


class TestLimplicationNestJamaisVide:
    def test_chaque_signal_porte_impact_interlocuteur_et_action(self):
        # Le reproche du §25 : « le signal n'est pas transformé en impact,
        # interlocuteur et action ». Un signal sans implication est une coupure
        # de presse, et le produit ne vend pas des coupures de presse.
        stamped = stamp_signals_freshness([signal("Recrutement IT actif : 4 offres ouvertes", "2026-07-15")])
        layers = layer_signals(stamped)

        implication = layers["visible"][0]["implication"]
        assert implication["category"] == "recrutement"
        for key in ("impact", "who", "action"):
            assert implication[key].strip()

    def test_une_categorie_inconnue_le_DIT_au_lieu_decrire_une_generalite(self):
        # Une généralité fait perdre du temps sans que personne ne remarque le
        # trou. Le dire arrête la recherche de sens et rend le manque visible.
        implication = commercial_implication({"signal": "Communiqué institutionnel"})
        assert implication["category"] == "inconnu"
        assert "ne savons pas" in implication["impact"]

    def test_limplication_enonce_un_fait_mecanique_pas_une_prediction(self):
        # « Un budget confirmé ouvre une fenêtre d'achat » est vrai de tout
        # budget confirmé ; « ce compte va acheter » ne l'est d'aucun.
        impact = commercial_implication({"signal": "Enveloppe budgétaire votée"})["impact"]
        assert "va acheter" not in impact
        assert "fenêtre d'achat" in impact


class TestLesBordsQuiCassentUneListe:
    def test_une_liste_vide_ou_absente_ne_leve_pas(self):
        for empty in (None, [], [{}]):
            layers = layer_signals(empty)
            assert isinstance(layers["visible"], list)

    def test_un_signal_sans_date_reste_visible_mais_apres_les_datés(self):
        # Non daté n'est pas archivé : c'est « on ne sait pas », et un fait qu'on
        # ne sait pas dater peut parfaitement être d'hier.
        stamped = stamp_signals_freshness(
            [signal("Sans date", ""), signal("Budget confirmé", "2026-07-30")]
        )
        layers = layer_signals(stamped)
        assert [s["signal"] for s in layers["visible"]] == ["Budget confirmé", "Sans date"]
