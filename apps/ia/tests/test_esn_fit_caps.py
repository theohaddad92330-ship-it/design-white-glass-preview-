"""Le /25 doit dépendre du profil ESN (DoD p31 n°1, moitié SCORE).

Le trou fermé ici : les 5 axes étaient notés par le LLM et sommés tels quels.
Ni le stade ESN ni rien d'autre du profil n'entrait dans la règle — deux ESN
opposées obtenaient donc le MÊME verdict sur le MÊME compte. C'était la
sentinelle `test_sentinelle_le_score_25_ignore_le_profil_esn`.

Ce n'est pas une correction cosmétique : p25 met explicitement la **taille** dans
l'axe Accessibilité (« relation, BU, panel, géo, taille ? ») et le **delivery**
dans l'axe Capacité. Un freelance qui obtient 5/5 d'accessibilité sur un grand
groupe au panel fermé, c'est un GO que personne ne peut exécuter — exactement
l'anti-recommandation répétée sur six pages du rapport.
"""

from __future__ import annotations

import pytest

from app.services.account_score import score_from_breakdown, verdict_for_score
from app.services.esn_fit import apply_esn_fit_caps, esn_fit_caps

# Un compte noté généreusement par le modèle sur les 5 axes.
_BREAKDOWN_GENEREUX = [
    {"axis": "fit_offre", "points": 5},
    {"axis": "timing", "points": 4},
    {"axis": "accessibilite", "points": 5},
    {"axis": "concurrence", "points": 4},
    {"axis": "capacite", "points": 5},
]


def _points(breakdown: list[dict], axis: str) -> int:
    return next(item["points"] for item in breakdown if item["axis"] == axis)


class TestLeProfilEsnEntreDansLeScore:
    def test_un_freelance_ne_peut_pas_etre_pleinement_accessible_sur_un_grand_groupe(self) -> None:
        capped, notes = apply_esn_fit_caps(
            _BREAKDOWN_GENEREUX, esn_stage="freelance", account_archetype="grand_groupe"
        )

        assert _points(capped, "accessibilite") < 5
        assert _points(capped, "capacite") < 5
        assert notes, "un plafond appliqué doit citer sa règle (p31)"

    def test_une_grande_esn_garde_son_score_sur_le_meme_compte(self) -> None:
        """Le cœur du critère n°1 : MÊME compte, MÊME notation du modèle, deux
        ESN opposées → deux scores et potentiellement deux verdicts."""
        capped, _ = apply_esn_fit_caps(
            _BREAKDOWN_GENEREUX, esn_stage="grande", account_archetype="grand_groupe"
        )

        assert capped == _BREAKDOWN_GENEREUX

    def test_le_verdict_lui_meme_bascule(self) -> None:
        petite, _ = apply_esn_fit_caps(
            _BREAKDOWN_GENEREUX, esn_stage="freelance", account_archetype="banque_assurance"
        )
        grande, _ = apply_esn_fit_caps(
            _BREAKDOWN_GENEREUX, esn_stage="grande", account_archetype="banque_assurance"
        )

        assert verdict_for_score(score_from_breakdown(grande)) == "GO"
        assert verdict_for_score(score_from_breakdown(petite)) != "GO"

    def test_une_pme_reste_accessible_a_tout_le_monde(self) -> None:
        """p5 PME/ETI : « RSI/DSI joignable, peu de panel, proximité ». Aucune
        taille d'ESN n'y est structurellement bloquée — donc aucun plafond."""
        for stage in ("freelance", "petite", "structuration", "etablie", "grande"):
            capped, notes = apply_esn_fit_caps(
                _BREAKDOWN_GENEREUX, esn_stage=stage, account_archetype="pme_eti"
            )
            assert capped == _BREAKDOWN_GENEREUX, stage
            assert notes == [], stage

    def test_une_startup_reste_accessible_a_un_freelance(self) -> None:
        """p5 startup : « accès direct, cycle court ». C'est le terrain naturel
        d'une petite structure — la plafonner ici serait un contresens."""
        capped, _ = apply_esn_fit_caps(
            _BREAKDOWN_GENEREUX, esn_stage="freelance", account_archetype="startup"
        )

        assert capped == _BREAKDOWN_GENEREUX


class TestSurete:
    """Un plafond ne peut que BAISSER, et seulement sur une donnée connue."""

    @pytest.mark.parametrize(
        ("stage", "archetype"),
        [
            (None, "grand_groupe"),
            ("freelance", None),
            ("freelance", "inconnu"),
            ("", ""),
            ("stade_invente", "grand_groupe"),
            ("freelance", "archetype_invente"),
        ],
    )
    def test_une_donnee_absente_ou_inconnue_ne_plafonne_rien(
        self, stage: str | None, archetype: str | None
    ) -> None:
        """SÛRETÉ : sans stade OU sans archétype, le score est celui d'avant ce
        module, au point près. On ne pénalise jamais sur une supposition."""
        capped, notes = apply_esn_fit_caps(
            _BREAKDOWN_GENEREUX, esn_stage=stage, account_archetype=archetype
        )

        assert capped == _BREAKDOWN_GENEREUX
        assert notes == []

    def test_un_plafond_ne_remonte_jamais_un_axe(self) -> None:
        maigre = [
            {"axis": "fit_offre", "points": 1},
            {"axis": "timing", "points": 1},
            {"axis": "accessibilite", "points": 1},
            {"axis": "concurrence", "points": 1},
            {"axis": "capacite", "points": 1},
        ]
        capped, _ = apply_esn_fit_caps(
            maigre, esn_stage="freelance", account_archetype="grand_groupe"
        )

        assert capped == maigre

    def test_les_axes_non_concernes_ne_bougent_pas(self) -> None:
        """Seuls Accessibilité et Capacité portent la taille de l'ESN dans la
        grille p25. Fit, Timing et Concurrence sont des propriétés du COMPTE."""
        capped, _ = apply_esn_fit_caps(
            _BREAKDOWN_GENEREUX, esn_stage="freelance", account_archetype="public"
        )

        assert _points(capped, "fit_offre") == 5
        assert _points(capped, "timing") == 4
        assert _points(capped, "concurrence") == 4

    def test_l_entree_n_est_pas_mutee(self) -> None:
        avant = [dict(item) for item in _BREAKDOWN_GENEREUX]
        apply_esn_fit_caps(_BREAKDOWN_GENEREUX, esn_stage="freelance", account_archetype="public")

        assert _BREAKDOWN_GENEREUX == avant


class TestLaTableEstMonotone:
    """Plus l'ESN est mûre, moins elle est plafonnée — jamais l'inverse."""

    @pytest.mark.parametrize(
        "archetype",
        ["grand_groupe", "banque_assurance", "public", "international", "industrie", "luxe_retail_media"],
    )
    def test_le_plafond_croit_avec_le_stade(self, archetype: str) -> None:
        caps = [esn_fit_caps(stage, archetype) for stage in
                ("freelance", "petite", "structuration", "etablie", "grande")]

        for axis in ("accessibilite", "capacite"):
            valeurs = [c.get(axis, 5) for c in caps]
            assert valeurs == sorted(valeurs), (archetype, axis, valeurs)

    def test_une_grande_esn_n_est_plafonnee_nulle_part(self) -> None:
        for archetype in (
            "grand_groupe",
            "banque_assurance",
            "public",
            "international",
            "industrie",
            "luxe_retail_media",
            "pme_eti",
            "startup",
        ):
            assert esn_fit_caps("grande", archetype) == {}, archetype
