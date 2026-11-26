"""#2118 — parité du contrat « lecture du dossier » : TS (source) ↔ pydantic.

⚠️ La raison d'être de ce test tient en une ligne du dépôt : **pydantic ignore
les clés qu'il ne connaît pas.** Un bloc demandé au prompt, produit par le
modèle et payé disparaît en silence si `Evaluation` ne le déclare pas — ni
erreur, ni test du prompt, ni test d'écran ne peuvent le voir. C'est arrivé à
`bellum_read` (#1607.1). Ici le bloc porte QUINZE champs et quatre
sous-objets : la même erreur coûterait quinze fois.

La garde lit le contrat TypeScript et compare champ par champ. Elle prouve
qu'elle lit quelque chose (extraction non vide) et qu'elle sait dire NON (un
témoin volontairement amputé doit la faire tomber).
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest
from pydantic import BaseModel

from app.models.outputs.plan import (
    DossierAntiAdvice,
    DossierEntryPoint,
    DossierMissingItem,
    DossierNextAction,
    DossierNoGo,
    DossierObstacle,
    DossierRead,
    DossierReliability,
    DossierReliabilityDimension,
    DossierScoreAxis,
    Evaluation,
)
from app.services.dossier_read import (
    DOSSIER_AXIS_MAX,
    DOSSIER_AXIS_STATES,
    DOSSIER_AXIS_WEIGHT,
    DOSSIER_SCORE_ALGORITHM_VERSION,
    DOSSIER_SCORE_AXES,
    DOSSIER_SCORE_MIN_MEASURED_AXES,
    dossier_score,
    normalize_dossier_read,
    scoring_objectives,
)

_TS_REL = Path("packages/contracts/src/schemas/analysis/dossier-read.ts")

# Le contrat TS → le modèle pydantic qui le relit. Toute entrée ajoutée d'un
# côté doit l'être de l'autre : c'est exactement ce que la garde vérifie.
_PARITY: dict[str, type[BaseModel]] = {
    "dossierScoreAxisSchema": DossierScoreAxis,
    "dossierReliabilityDimensionSchema": DossierReliabilityDimension,
    "dossierReliabilitySchema": DossierReliability,
    "dossierObstacleSchema": DossierObstacle,
    "dossierAntiAdviceSchema": DossierAntiAdvice,
    "dossierNextActionSchema": DossierNextAction,
    "dossierEntryPointSchema": DossierEntryPoint,
    "dossierNoGoSchema": DossierNoGo,
    "dossierMissingItemSchema": DossierMissingItem,
    "dossierReadSchema": DossierRead,
}


def _monorepo_file(rel: Path) -> Path | None:
    for parent in Path(__file__).resolve().parents:
        candidate = parent / rel
        if candidate.is_file():
            return candidate
    return None


def _strip_comments(source: str) -> str:
    """Les docblocks français portent des accolades et des apostrophes ; les
    laisser ferait compter des fragments de phrase comme des champs."""
    source = re.sub(r"/\*[\s\S]*?\*/", "", source)
    return re.sub(r"^(.*?)//.*$", r"\1", source, flags=re.MULTILINE)


def _schema_fields(source: str, const_name: str) -> set[str]:
    """Les clés de premier niveau d'un `z.object({ … })` nommé."""
    start = source.index(f"export const {const_name}")
    open_brace = source.index("{", source.index(".object(", start))
    depth = 0
    fields: set[str] = set()
    line_start = True
    key = ""
    for index in range(open_brace, len(source)):
        char = source[index]
        if char == "{":
            depth += 1
            line_start = True
            continue
        if char == "}":
            depth -= 1
            if depth == 0:
                return fields
            line_start = True
            continue
        if char == "\n":
            line_start = True
            key = ""
            continue
        if depth == 1 and line_start:
            if char.isspace():
                continue
            if char == ":" and key:
                fields.add(key)
                line_start = False
                key = ""
                continue
            if char.isalnum() or char == "_":
                key += char
                continue
            line_start = False
            key = ""
    raise AssertionError(f"accolade non refermée pour {const_name}")


def _contract_source() -> str:
    path = _monorepo_file(_TS_REL)
    if path is None:  # pragma: no cover - image de déploiement sans le monorepo
        pytest.skip("monorepo absent — la parité se vérifie en CI")
    return _strip_comments(path.read_text(encoding="utf-8"))


def test_la_garde_lit_vraiment_le_contrat() -> None:
    source = _contract_source()
    fields = {name: _schema_fields(source, name) for name in _PARITY}
    assert all(fields.values()), f"extraction vide : {[k for k, v in fields.items() if not v]}"
    assert len(fields["dossierReadSchema"]) >= 12, "le bloc principal n'a pas été lu en entier"


def test_chaque_champ_du_contrat_est_declare_cote_pydantic() -> None:
    source = _contract_source()
    for const_name, model in _PARITY.items():
        ts_fields = _schema_fields(source, const_name)
        py_fields = set(model.model_fields)
        assert ts_fields == py_fields, (
            f"{const_name} ↔ {model.__name__} divergent — "
            f"absents côté pydantic : {sorted(ts_fields - py_fields)} ; "
            f"en trop : {sorted(py_fields - ts_fields)}"
        )


def test_la_garde_sait_dire_non() -> None:
    """Témoin : un modèle amputé d'un champ DOIT faire tomber la comparaison."""
    source = _contract_source()
    ts_fields = _schema_fields(source, "dossierReadSchema")
    ampute = ts_fields - {"anti_advice"}
    assert ts_fields != ampute
    assert "anti_advice" in ts_fields, "le champ témoin a disparu du contrat"


def test_le_bloc_est_branche_sur_l_evaluation() -> None:
    """Un bloc que `Evaluation` ne déclare pas n'arrive jamais en base."""
    assert "dossier_read" in Evaluation.model_fields
    evaluation = Evaluation.model_validate(
        {"score": 17, "dossier_read": {"why_for_your_esn": "Ton offre data colle au programme Socle."}}
    )
    assert evaluation.dossier_read is not None
    assert evaluation.dossier_read.why_for_your_esn == "Ton offre data colle au programme Socle."


def test_les_sept_axes_sont_ceux_du_contrat() -> None:
    source = _contract_source()
    body = source.split("export const DOSSIER_SCORE_AXES")[1].split("] as const")[0]
    ts_axes = tuple(re.findall(r"'([a-z_]+)'", body))
    assert ts_axes == DOSSIER_SCORE_AXES
    assert len(DOSSIER_SCORE_AXES) == 7


class TestNormalisation:
    """#2118.52 — ce que le modèle rend de travers ne doit ni mentir ni tout perdre."""

    def test_un_axe_inconnu_perd_son_zero(self) -> None:
        read = normalize_dossier_read({"axes": [{"key": "concurrence", "state": "unknown", "value": 0}]})
        assert read["axes"] == [
            {"key": "concurrence", "state": "unknown", "value": None, "impact": None, "lever": None}
        ]

    def test_un_axe_sans_note_devient_inconnu(self) -> None:
        read = normalize_dossier_read({"axes": [{"key": "fraicheur", "state": "measured", "impact": "fort"}]})
        assert read["axes"][0]["state"] == "unknown"
        assert read["axes"][0]["value"] is None

    def test_un_axe_hors_liste_est_ecarte(self) -> None:
        read = normalize_dossier_read(
            {
                "axes": [
                    {"key": "sympathie", "state": "measured", "value": 5},
                    {"key": "concurrence", "state": "measured", "value": 3},
                ]
            }
        )
        assert [axis["key"] for axis in read["axes"]] == ["concurrence"]

    def test_une_note_hors_bornes_est_ramenee_dans_l_echelle(self) -> None:
        read = normalize_dossier_read({"axes": [{"key": "concurrence", "state": "measured", "value": 42}]})
        assert read["axes"][0]["value"] == DOSSIER_AXIS_MAX

    def test_un_etat_invente_devient_inconnu(self) -> None:
        read = normalize_dossier_read({"axes": [{"key": "concurrence", "state": "excellent", "value": 4}]})
        assert read["axes"][0]["state"] == "unknown"
        assert set(DOSSIER_AXIS_STATES) == {"measured", "partial", "unknown"}

    def test_un_no_go_est_toujours_temporaire(self) -> None:
        read = normalize_dossier_read(
            {"no_go": {"temporary": False, "context": "Panel fermé", "trigger": "Renouvellement"}}
        )
        assert read["no_go"]["temporary"] is True

    def test_une_fiabilite_inconnue_perd_son_chiffre(self) -> None:
        read = normalize_dossier_read({"reliability": {"coverage": {"state": "unknown", "value": 0}}})
        assert read["reliability"]["coverage"]["value"] is None

    def test_un_bloc_vide_ne_devient_pas_un_bloc_menteur(self) -> None:
        assert normalize_dossier_read(None) is None
        assert normalize_dossier_read({}) is None

    # #2304.7 (épopée #2932, LAU-FINAL-045) — Q6 « quelle voie d'achat ou
    # d'accès plausible » : absente du schéma avant ce point, contrairement à
    # `best_entry_point` (qui, lui, ne dit PAS par où entrer commercialement).
    def test_la_voie_d_acces_se_normalise_comme_un_texte_simple(self) -> None:
        read = normalize_dossier_read({"access_path": "  Entrer par le programme Cloud Souverain déjà lancé  "})
        assert read["access_path"] == "Entrer par le programme Cloud Souverain déjà lancé"

    def test_une_voie_d_acces_vide_ne_pose_pas_la_cle(self) -> None:
        read = normalize_dossier_read({"why_for_your_esn": "Ton offre colle.", "access_path": "   "})
        assert read["access_path"] is None


class TestProfilIncomplet:
    """#2118.20 — « profil incomplet » est un FAIT qu'on connaît, pas un avis du modèle."""

    def test_un_profil_sans_offres_est_incomplet(self) -> None:
        from app.services.dossier_read import profile_incompleteness

        assert profile_incompleteness({"companyName": "X"}) == ["offers", "sectors", "positioning", "references"]

    def test_un_profil_complet_ne_declenche_rien(self) -> None:
        from app.services.dossier_read import profile_incompleteness

        assert (
            profile_incompleteness(
                {
                    "offers": ["Data"],
                    "sectors": ["Banque"],
                    "positioning": "Expertise data",
                    "references": ["BNP"],
                }
            )
            == []
        )


class TestBrancheSurLePipeline:
    """L'APPELANT : un bloc normalisé que rien n'appelle n'est pas livré."""

    def test_le_pipeline_normalise_le_bloc_et_pose_le_profil(self) -> None:
        from app.routers.phase4_plan import _normalize_dossier_read_block

        merged = {
            "evaluation": {
                "dossier_read": {
                    "why_for_your_esn": "Ton offre data colle au programme Socle.",
                    "axes": [
                        {"key": "concurrence", "state": "unknown", "value": 0},
                        {"key": "sympathie", "state": "measured", "value": 5},
                    ],
                    "no_go": {"temporary": False, "context": "Panel fermé", "trigger": "Renouvellement"},
                }
            }
        }
        _normalize_dossier_read_block(merged, {"offers": ["Data"], "sectors": ["Banque"]})
        block = merged["evaluation"]["dossier_read"]
        assert block["axes"] == [
            {"key": "concurrence", "state": "unknown", "value": None, "impact": None, "lever": None}
        ]
        assert block["no_go"]["temporary"] is True
        assert block["profile_incomplete"] is True
        assert block["profile_incomplete_fields"] == ["positioning", "references"]

    def test_un_dossier_sans_bloc_ne_gagne_pas_un_bloc_vide(self) -> None:
        from app.routers.phase4_plan import _normalize_dossier_read_block

        merged: dict = {"evaluation": {"score": 17}}
        _normalize_dossier_read_block(merged, {"offers": ["Data"]})
        assert "dossier_read" not in merged["evaluation"]

    def test_le_pipeline_pose_le_poids_et_la_version_de_l_algorithme(self) -> None:
        """#2306.22/.23 — conservés sur CHAQUE bloc, sans dépendre du profil."""
        from app.routers.phase4_plan import _normalize_dossier_read_block

        merged = {"evaluation": {"dossier_read": {"why_for_your_esn": "Pour ton offre data."}}}
        _normalize_dossier_read_block(merged, None)
        block = merged["evaluation"]["dossier_read"]
        assert block["axis_weights"] == {key: DOSSIER_AXIS_WEIGHT for key in DOSSIER_SCORE_AXES}
        assert block["algorithm_version"] == DOSSIER_SCORE_ALGORITHM_VERSION

    def test_le_pipeline_pose_les_objectifs_commerciaux_actifs(self) -> None:
        """#2306.16 — les objectifs NOMMÉS du profil, pas l'objectif de phase du plan."""
        from app.routers.phase4_plan import _normalize_dossier_read_block

        merged = {"evaluation": {"dossier_read": {"why_for_your_esn": "Pour ton offre data."}}}
        profile = {"offers": ["Data"], "objectives": [{"kind": "new_accounts"}, {"kind": "structuring"}]}
        _normalize_dossier_read_block(merged, profile)
        assert merged["evaluation"]["dossier_read"]["scoring_objectives"] == ["new_accounts", "structuring"]


class TestScoringObjectives:
    """#2306.16 — extraction pure, sans invention ni doublon."""

    def test_rend_les_natures_nommees_dans_l_ordre(self) -> None:
        assert scoring_objectives({"objectives": [{"kind": "meetings"}, {"kind": "revenue"}]}) == [
            "meetings",
            "revenue",
        ]

    def test_deduplique_une_nature_repetee(self) -> None:
        assert scoring_objectives({"objectives": [{"kind": "meetings"}, {"kind": "meetings"}]}) == ["meetings"]

    def test_aucun_objectif_declare_rend_une_liste_vide_jamais_une_invention(self) -> None:
        assert scoring_objectives({}) == []
        assert scoring_objectives(None) == []
        assert scoring_objectives({"objectives": []}) == []

    def test_ignore_une_entree_sans_nature_lisible(self) -> None:
        assert scoring_objectives({"objectives": [{"value": 20}, {"kind": ""}, {"kind": "  "}]}) == []


class TestPromptEvaluation:
    """#2118.19 — les raisons sont rédigées POUR l'ESN du profil, jamais interchangeables."""

    def _prompt(self) -> str:
        from app.prompts.bellum_plan import build_subsection_user_prompt

        return build_subsection_user_prompt(
            company_name="SNCF",
            section="evaluation",
            profile_data={"offers": ["Data"], "sectors": ["Transport"]},
        )

    def test_le_prompt_nomme_les_sept_axes(self) -> None:
        prompt = self._prompt()
        for axis in DOSSIER_SCORE_AXES:
            assert axis in prompt, f"axe absent du prompt : {axis}"

    def test_le_prompt_interdit_une_raison_interchangeable(self) -> None:
        prompt = self._prompt().lower()
        assert "profil esn" in prompt
        assert "interchangeable" in prompt

    def test_le_prompt_demande_les_blocs_rediges(self) -> None:
        prompt = self._prompt()
        for key in ("why_for_your_esn", "recommended_scope", "anti_advice", "obstacles", "missing", "no_go"):
            assert key in prompt, f"bloc absent du prompt : {key}"

    # #2304.7 — Q6, absente du schéma avant ce point (registre LAU-FINAL-045).
    def test_le_prompt_demande_la_voie_d_acces(self) -> None:
        assert "access_path" in self._prompt()

    def test_le_prompt_de_notation_ne_porte_aucun_critere_protege(self) -> None:
        """L'interdit porte sur le PROMPT autant que sur le code (c58)."""
        prompt = self._prompt().lower()
        for forbidden in ("photo", "âge", "genre", "nationalit", "origine", "situation familiale"):
            assert forbidden not in prompt, f"critère protégé dans le prompt de notation : {forbidden}"


class TestPlancherDeuxAxes:
    """⚠️ #4016.L9.a revient sur le seuil de trois axes (c26), délibérément —
    Louis 13/10/2026 : un score de compte s'affiche dès DEUX axes évaluables."""

    _ACCOUNT_SCORE_REL = Path("packages/contracts/src/schemas/account-score.ts")

    def test_le_plancher_est_celui_du_contrat_ts(self) -> None:
        path = _monorepo_file(self._ACCOUNT_SCORE_REL)
        if path is None:  # pragma: no cover - image de déploiement sans le monorepo
            pytest.skip("monorepo absent — la parité se vérifie en CI")
        source = _strip_comments(path.read_text(encoding="utf-8"))
        found = re.search(r"export const ACCOUNT_SCORE_MIN_EVALUATED_AXES = (\d+)", source)
        assert found is not None, "la garde doit LIRE le plancher du contrat"
        assert int(found.group(1)) == DOSSIER_SCORE_MIN_MEASURED_AXES == 2

    def test_deux_axes_font_un_score(self) -> None:
        score = dossier_score(
            [
                {"key": "adequation_offre", "state": "measured", "value": 4},
                {"key": "concurrence", "state": "partial", "value": 2},
            ]
        )
        assert score["kind"] == "score"
        assert (score["value"], score["out_of"], score["scored_axes"]) == (6, 10, 2)
        assert len(score["unknown_axes"]) == 5

    def test_sait_dire_non_un_seul_axe(self) -> None:
        score = dossier_score([{"key": "adequation_offre", "state": "measured", "value": 5}])
        assert score["kind"] == "insufficient"
        assert "value" not in score
