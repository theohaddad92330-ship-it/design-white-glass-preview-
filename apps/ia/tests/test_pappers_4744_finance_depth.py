"""#4744 — la profondeur financière du compte analysé (marge, exploitation, clôture datée).

Rien n'est dérivé ni inventé : ce que le registre ne publie pas reste `None`.
Aucun appel supplémentaire — les champs viennent du MÊME `/v2/entreprise` déjà mis en cache.
"""

from __future__ import annotations

from app.services.pappers import CompanyProfile


def _profile(finances: list[dict]) -> CompanyProfile:
    return CompanyProfile.model_validate({"siren": "123456789", "finances": finances})


def test_exercice_porte_cloture_marge_et_exploitation() -> None:
    p = _profile(
        [
            {
                "annee": 2023,
                "date_de_cloture_exercice": "2023-12-31",
                "chiffre_affaires": 1_000_000,
                "resultat": 50_000,
                "marge_brute": 400_000,
                "excedent_brut_d_exploitation": 90_000,
                "resultat_exploitation": 70_000,
            }
        ]
    )
    y = p.financials_history[0]
    assert y.closing_date == "2023-12-31"
    assert y.gross_margin == 400_000
    assert y.ebitda == 90_000
    assert y.operating_result == 70_000


def test_valeur_non_publiee_reste_none_jamais_zero() -> None:
    p = _profile([{"annee": 2022, "chiffre_affaires": 900_000}])
    y = p.financials_history[0]
    assert y.gross_margin is None
    assert y.ebitda is None
    assert y.operating_result is None
    assert y.closing_date is None


def test_champs_exposes_dans_le_dump_sans_alias() -> None:
    p = _profile([{"annee": 2023, "marge_brute": 1}])
    dumped = p.model_dump(by_alias=False, mode="json")["financials_history"][0]
    assert dumped["gross_margin"] == 1
    assert "closing_date" in dumped
