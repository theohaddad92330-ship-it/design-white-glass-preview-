"""Lot 13 — l'axe CHEMIN de l'adressabilité (#1631.3/.4/.5, #1606.2, #1606.6).

─────────────────────────────────────────────────────────────────────────────
CE QUE CE FICHIER TIENT
─────────────────────────────────────────────────────────────────────────────
Le retour, verbatim : « < 3 parcours vers une même ESN / route cohérente →
None / axe non mesuré. 3–4 observations → preuve intermédiaire. >=5 → preuve
forte. Le barème exact peut rester compatible avec les 5 points existants mais
INTERDIT : 1 observation → 2/5. Le seuil transverse de Market Memory est 3. »
Et : « Evidence : "9 parcours observés relient ALTEN à cet environnement —
chemin partenaire à qualifier." Le mot QUALIFIER est obligatoire. »

Trois preuves, comme toute garde de ce module (voir
``test_discover_scoring_addressability_axes.py``, GA-272) :

1. **elle sait dire NON** — un compte de parcours sous le seuil transverse ne
   produit JAMAIS de facteur, quelle que soit la valeur (0, 1, 2) : le test
   ``test_below_the_transverse_threshold_is_unmeasured_never_zero`` échoue si
   on remplace la garde par un ``max(0, ...)`` qui laisserait passer un score
   partiel ;
2. **elle LIT quelque chose** — la matrice couvre les DEUX paliers du barème
   (intermédiaire et fort) et les deux bords (juste sous / juste au seuil) ;
3. **elle n'attrape pas ce qu'elle ne vise pas** — un compte de parcours FORT
   (``>= 5``) reste un score MESURÉ, jamais renvoyé comme « non mesuré » sous
   prétexte qu'il dépasse un plafond ; le test le vérifie explicitement.
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

import pytest

from app.services.discover_scoring import (
    _AXIS_PATH,
    _MARKET_MEMORY_MIN_PATHS,
    _PATH_INTERMEDIATE_POINTS,
    _PATH_STRONG_MIN_PATHS,
    addressability_for_company,
)

SMALL_COMPANY: dict[str, Any] = {"headcountRange": "100 à 199 salariés"}
SMALL_ESN: dict[str, Any] = {"size": "1-10"}


def _factor(result: dict[str, Any], axis: str) -> dict[str, Any] | None:
    return next((f for f in result["factors"] if f["axis"] == axis), None)


def _run(paths: int | None, esn: str | None = None) -> dict[str, Any]:
    return addressability_for_company(
        SMALL_COMPANY, SMALL_ESN, [], None, market_paths_observed=paths, market_top_esn=esn
    )


# ── LE SEUIL TRANSVERSE ─────────────────────────────────────────────────────


def test_no_ingredient_leaves_the_axis_unmeasured() -> None:
    """Le défaut (aucun appelant actuel n'en transporte encore, voir le
    commentaire au-dessus de `_AXIS_LOCK`) doit rester ce qu'il était AVANT ce
    lot : `path` non mesuré, jamais un zéro."""
    result = _run(None)
    assert _factor(result, "path") is None
    assert "path" in result["unmeasured"]


@pytest.mark.parametrize("paths", [0, 1, 2, _MARKET_MEMORY_MIN_PATHS - 1])
def test_below_the_transverse_threshold_is_unmeasured_never_zero(paths: int) -> None:
    """⚠️ INTERDIT explicitement par le retour : « 1 observation → 2/5 ». Sous
    le seuil transverse, l'axe est NON MESURÉ — jamais un facteur à zéro, et
    jamais un facteur à un score partiel."""
    result = _run(paths, "ALTEN")
    assert _factor(result, "path") is None, result
    assert "path" in result["unmeasured"], result


def test_top_esn_alone_without_a_count_measures_nothing() -> None:
    """Le nom seul ne suffit pas — c'est le COMPTE qui porte la mesure."""
    result = addressability_for_company(
        SMALL_COMPANY, SMALL_ESN, [], None, market_paths_observed=None, market_top_esn="ALTEN"
    )
    assert _factor(result, "path") is None
    assert "path" in result["unmeasured"]


# ── LES DEUX PALIERS ────────────────────────────────────────────────────────


@pytest.mark.parametrize("paths", [_MARKET_MEMORY_MIN_PATHS, _MARKET_MEMORY_MIN_PATHS + 1, _PATH_STRONG_MIN_PATHS - 1])
def test_three_to_four_observations_is_intermediate_proof(paths: int) -> None:
    """« 3–4 observations → preuve intermédiaire » — mesuré, mais SOUS le
    plafond de l'axe : une preuve intermédiaire ne vaut pas une preuve forte."""
    result = _run(paths, "ALTEN")
    factor = _factor(result, "path")
    assert factor is not None, result
    assert factor["points"] == _PATH_INTERMEDIATE_POINTS
    assert 0 < factor["points"] < _AXIS_PATH
    assert "path" not in result["unmeasured"]


@pytest.mark.parametrize("paths", [_PATH_STRONG_MIN_PATHS, _PATH_STRONG_MIN_PATHS + 4, 38])
def test_five_or_more_observations_is_strong_proof_at_the_full_cap(paths: int) -> None:
    """« >=5 → preuve forte » — le plafond plein de l'axe, pas un point de
    plus (l'invariant « aucun facteur ne dépasse son plafond » tient)."""
    result = _run(paths, "ALTEN")
    factor = _factor(result, "path")
    assert factor is not None, result
    assert factor["points"] == _AXIS_PATH
    assert "path" not in result["unmeasured"]


def test_a_strong_score_is_measured_not_mistaken_for_unmeasured() -> None:
    """Preuve n°3 — le témoin : un score FORT (le maximum du barème) reste un
    facteur MESURÉ, jamais confondu avec un axe qu'on n'a pas pu regarder."""
    result = _run(9, "ALTEN")
    factor = _factor(result, "path")
    assert factor is not None
    assert factor["points"] == 5
    assert result["max"] >= _AXIS_PATH


# ── L'EVIDENCE, MOT POUR MOT ────────────────────────────────────────────────


def test_evidence_matches_the_exact_wording_of_the_return() -> None:
    """La phrase EXACTE citée par le retour : « 9 parcours observés relient
    ALTEN à cet environnement — chemin partenaire à qualifier. »"""
    result = _run(9, "ALTEN")
    factor = _factor(result, "path")
    assert factor is not None
    assert factor["evidence"] == "9 parcours observés relient ALTEN à cet environnement — chemin partenaire à qualifier."


@pytest.mark.parametrize("paths,esn", [(3, "ALTEN"), (5, "Capgemini"), (12, None)])
def test_evidence_always_contains_the_mandatory_word_qualifier(paths: int, esn: str | None) -> None:
    """⚠️ « Le mot QUALIFIER est obligatoire » — le retour le répète deux fois.
    Vrai sur les deux paliers, avec ou sans nom d'ESN connu."""
    factor = _factor(_run(paths, esn), "path")
    assert factor is not None
    assert "qualifier" in factor["evidence"]


def test_evidence_never_names_a_specific_esn_it_was_not_given() -> None:
    """Sans nom d'ESN, l'evidence reste vraie — elle ne devine JAMAIS un nom."""
    factor = _factor(_run(9, None), "path")
    assert factor is not None
    assert "ALTEN" not in factor["evidence"]
    assert "sociétés de services partenaires" in factor["evidence"]


def test_evidence_never_reads_as_a_current_presence_or_a_probability() -> None:
    """« observé », jamais « en place » / « fournisseur actuel » (même
    doctrine que `market_esn_client` côté API) ; aucune PROBABILITÉ, jamais de
    pourcentage de chance — doctrine du dépôt (c26_probabilite)."""
    for banned in ("en place", "fournisseur actuel", "travaille chez", "intervient chez", "%", "chance de"):
        for paths in (3, 9):
            factor = _factor(_run(paths, "ALTEN"), "path")
            assert factor is not None
            assert banned not in factor["evidence"], (banned, factor["evidence"])


# ── COMPOSITION AVEC LES AUTRES AXES ────────────────────────────────────────


def test_default_call_without_the_new_kwargs_is_byte_identical_to_before_this_lot() -> None:
    """Aucun appelant existant ne passe encore ces deux paramètres — l'ajout
    doit être invisible pour eux."""
    without = addressability_for_company(SMALL_COMPANY, SMALL_ESN, [], None)
    explicit_none = addressability_for_company(
        SMALL_COMPANY, SMALL_ESN, [], None, market_paths_observed=None, market_top_esn=None
    )
    assert without == explicit_none


def test_path_and_relation_can_both_be_measured_and_their_caps_both_enter_the_denominator() -> None:
    result = addressability_for_company(
        SMALL_COMPANY,
        SMALL_ESN,
        [],
        None,
        crm_presence="3 contact(s) déjà dans votre CRM",
        market_paths_observed=9,
        market_top_esn="ALTEN",
    )
    assert _factor(result, "path") is not None
    assert _factor(result, "relation") is not None
    # proportion : parsed=(100,199) → row 3 (<250), col pour ESN 1-10 → colonne
    # 0 → 5 points (table `_PROPORTION_TABLE[3][0]`). max = 5 (proportion) +
    # 5 (path) + 3 (relation) = 13 — pas de `lock` (aucun signal).
    assert result["max"] == 13, result


# ── LE MIROIR INTER-LANGAGE (GA-26) ─────────────────────────────────────────


def test_mirrors_the_ts_source_of_truth() -> None:
    """`_MARKET_MEMORY_MIN_PATHS` est un MIROIR tenu à la main de
    `packages/contracts/src/schemas/market-memory.ts::MARKET_MEMORY_MIN_PATHS`
    (aucun mécanisme ne synchronise une constante scalaire entre les deux
    langages — seules les FORMES de contrat le sont, voir
    `app/contracts/sync_schemas.py`). Cette lecture directe du fichier TS
    source fait échouer la suite Python si un seul des deux côtés change sans
    l'autre — GA-26, « un réglage vit à un seul endroit ».
    """
    ts_source = None
    for parent in Path(__file__).resolve().parents:
        candidate = parent / "packages" / "contracts" / "src" / "schemas" / "market-memory.ts"
        if candidate.is_file():
            ts_source = candidate
            break
    assert ts_source is not None, "market-memory.ts introuvable — ce test doit tourner dans le monorepo"
    text = ts_source.read_text(encoding="utf-8")
    match = re.search(r"export const MARKET_MEMORY_MIN_PATHS = (\d+)", text)
    assert match is not None, "MARKET_MEMORY_MIN_PATHS introuvable dans market-memory.ts — la source a changé de forme"
    assert int(match.group(1)) == _MARKET_MEMORY_MIN_PATHS
