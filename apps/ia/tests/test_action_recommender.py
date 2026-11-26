"""Deterministic next-best-action selector (Annexe méthodo p28, MOTEUR rule)."""

from __future__ import annotations

from app.services.action_recommender import (
    ACTION_CATALOG,
    CHANTIERS,
    MAX_ACTIONS,
    MIN_ACTIONS,
    recommend_actions_from_context,
    recommend_next_actions,
)


def _ids(actions):
    return [a["id"] for a in actions]


class TestMoteurRule:
    def test_always_returns_between_3_and_5_hierarchised(self):
        # The core rule: 3-5, never 20 flat. Exercise many scenarios.
        for verdict in ("GO", "PRUDENT", "STOP", "EXPLORER", None):
            for rel in ("froid", "client_actif", "rang2", "besoin_ouvert", "refere", "dormant", None):
                out = recommend_next_actions(verdict=verdict, relationship_state=rel)
                assert MIN_ACTIONS <= len(out) <= MAX_ACTIONS, (verdict, rel, len(out))

    def test_no_duplicate_actions(self):
        out = recommend_next_actions(verdict="GO", relationship_state="froid")
        assert len(_ids(out)) == len(set(_ids(out)))

    def test_every_action_is_catalogued_and_cites_a_why(self):
        out = recommend_next_actions(verdict="EXPLORER", relationship_state="froid")
        for a in out:
            assert a["id"] in ACTION_CATALOG
            assert a["chantier"] in CHANTIERS
            assert a["label"] and a["why"]


class TestScenarioRouting:
    def test_missing_data_or_explorer_collects_info_first(self):
        out = recommend_next_actions(verdict="EXPLORER", relationship_state="froid")
        assert out[0]["id"] == "corriger_identite"
        assert out[0]["chantier"] == "compte"

    def test_stop_does_not_invest(self):
        out = recommend_next_actions(verdict="STOP", relationship_state="froid")
        assert out[0]["id"] == "masquer_bruit"

    def test_active_client_is_expansion(self):
        out = recommend_next_actions(verdict="GO", relationship_state="client_actif")
        assert out[0]["chantier"] == "expansion"
        assert "foisonner_bu" in _ids(out)

    def test_rang2_goes_through_delivery(self):
        out = recommend_next_actions(verdict="PRUDENT", relationship_state="rang2")
        assert out[0]["id"] == "push_profil"

    def test_open_need_pushes_a_profile(self):
        out = recommend_next_actions(verdict="GO", relationship_state="besoin_ouvert")
        assert "push_profil" in _ids(out)
        assert "preparer_soutenance" in _ids(out)

    def test_referral_asks_for_an_intro(self):
        out = recommend_next_actions(verdict="GO", relationship_state="refere")
        assert out[0]["id"] == "demander_intro"

    def test_cold_account_opens_with_enrich_and_m1(self):
        out = recommend_next_actions(verdict="GO", relationship_state="froid")
        assert "enrichir_p1" in _ids(out)
        assert "envoyer_m1" in _ids(out)
        # never a generic catalogue dump / board reflex
        assert "push_profil" not in _ids(out)


class TestHorizonBoost:
    def test_horizon_brings_matching_actions_forward(self):
        # A 90j horizon on an active client should float the expansion actions
        # (which live at 90j) to the very top.
        out = recommend_next_actions(verdict="GO", relationship_state="client_actif", horizon="90j")
        assert out[0]["id"] in {"foisonner_bu", "consultant_capteur", "renouvellement"}

    def test_unknown_horizon_falls_back_to_7j(self):
        out = recommend_next_actions(verdict="GO", relationship_state="froid", horizon="bogus")
        assert MIN_ACTIONS <= len(out) <= MAX_ACTIONS


class TestFromContext:
    def test_reads_the_sales_context_dict(self):
        ctx = {
            "esnProfile": {"stage": "petite"},
            "account": {"archetype": "banque_assurance"},
            "relationship": {"state": "client_actif"},
        }
        out = recommend_actions_from_context(ctx, verdict="GO")
        assert out[0]["chantier"] == "expansion"

    def test_empty_context_still_yields_3_to_5(self):
        out = recommend_actions_from_context({}, verdict="GO")
        assert MIN_ACTIONS <= len(out) <= MAX_ACTIONS
        out2 = recommend_actions_from_context(None, verdict=None, has_missing_data=True)
        assert MIN_ACTIONS <= len(out2) <= MAX_ACTIONS


class TestExpansionFromRex:
    """#2424.10 / #2424.11 — l'expansion chez un client actif se contentait de
    « foisonner sur une BU adjacente », sans jamais nommer les pistes citées par
    la demande (équipe adjacente, filiale, besoin complémentaire) ni dire la
    première prudence attendue (en parler au manager du compte, ne jamais
    diffuser directement)."""

    def test_foisonner_bu_names_the_cautious_first_move(self):
        # #2424.11 — même sans REX, l'action générique d'expansion doit dire la
        # prudence : le manager d'abord, jamais la diffusion.
        out = recommend_next_actions(verdict="GO", relationship_state="client_actif")
        foisonner = next(a for a in out if a["id"] == "foisonner_bu")
        assert "manager" in foisonner["label"].lower()
        assert "diffus" in foisonner["label"].lower()

    def test_positive_rex_names_the_three_expansion_tracks(self):
        # #2424.10 — un REX positif remplace le générique par une piste NOMMÉE.
        out = recommend_next_actions(verdict="GO", relationship_state="client_actif", has_positive_rex=True)
        assert "expansion_rex_positif" in _ids(out)
        assert "foisonner_bu" not in _ids(out)
        label = next(a for a in out if a["id"] == "expansion_rex_positif")["label"].lower()
        for track in ("équipe adjacente", "filiale", "besoin complémentaire"):
            assert track in label
        assert "manager" in label
        assert "diffus" in label

    def test_without_a_positive_rex_the_generic_action_still_leads(self):
        """Témoin : `has_positive_rex` par défaut ne change RIEN — un rappel
        déjà là ne doit jamais se lire comme une régression du chemin normal."""
        out = recommend_next_actions(verdict="GO", relationship_state="client_actif")
        assert "expansion_rex_positif" not in _ids(out)
        assert "foisonner_bu" in _ids(out)

    def test_positive_rex_only_applies_to_an_active_client(self):
        """Témoin : le signal REX ne fabrique pas une expansion chez un compte
        froid — il affine la piste, il ne crée pas la relation."""
        out = recommend_next_actions(verdict="GO", relationship_state="froid", has_positive_rex=True)
        assert "expansion_rex_positif" not in _ids(out)

    def test_reads_the_positive_rex_signal_from_the_sales_context(self):
        ctx = {"relationship": {"state": "client_actif"}, "account": {"hasPositiveRex": True}}
        out = recommend_actions_from_context(ctx, verdict="GO")
        assert "expansion_rex_positif" in _ids(out)
