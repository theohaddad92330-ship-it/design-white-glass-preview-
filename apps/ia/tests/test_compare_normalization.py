"""#2293.8 / .9 / .10 — la comparaison se NORMALISE avant le modèle.

Cinq axes calculés en code (périmètre, couverture, preuves, axes, fraîcheur),
jamais écrits par le modèle ; un compte mince n'est pas comparé « à égalité »
à un compte documenté ; un compte non analysé est ÉCARTÉ, avec sa raison.
"""

from __future__ import annotations

from app.services.compare_normalization import normalize_accounts


def _axes(known: int, unknown: int) -> list[dict]:
    return [{"key": f"k{i}", "state": "known"} for i in range(known)] + [
        {"key": f"u{i}", "state": "unknown"} for i in range(unknown)
    ]


def _account(
    aid: str, name: str, *, axes: list[dict] | None = None, people: int = 0, sources: int = 0, **extra
) -> dict:
    people_rows = [{"sources": [{"id": f"s{j}"} for j in range(sources)] if i == 0 else []} for i in range(people)]
    raw: dict = {"org": {"orgGraph": {"people": people_rows}}}
    if axes is not None:
        raw["plan"] = {"evaluation": {"dossier_read": {"axes": axes}}}
    return {"id": aid, "company_name": name, "status": "completed", "raw_analysis": raw, **extra}


def test_les_cinq_axes_sont_calcules_et_une_absence_reste_none() -> None:
    documented = _account(
        "a1",
        "EDF",
        axes=_axes(6, 1),
        people=12,
        sources=9,
        siren="552081317",
        signals_collected_at="2026-09-20T10:00:00Z",
    )
    result = normalize_accounts(["a1"], [documented])
    [row] = result["normalization"]
    assert row["company"] == "EDF"
    assert row["perimeter"] == {"siren": "552081317", "group_role": None}
    assert row["coverage"] == {"people": 12}
    assert row["evidence"] == {"sources": 9}
    assert row["axes"] == {"evaluated": 6, "total": 7, "unmeasured": ["u0"]}
    assert row["freshness"] == {"collected_at": "2026-09-20T10:00:00Z"}
    assert row["depth"] == "solide"

    bare = _account("a2", "SNCF")
    [row] = normalize_accounts(["a2"], [bare])["normalization"]
    # Absence ≠ 0 : rien de collecté se dit « non mesuré », jamais zéro.
    assert row["axes"] is None
    assert row["freshness"] is None
    assert row["perimeter"] is None
    assert row["depth"] == "non_mesure"
    assert "axes du dossier" in row["unknowns"]


def test_un_compte_mince_n_est_pas_compare_a_egalite_d_un_compte_documente() -> None:
    documented = _account("a1", "EDF", axes=_axes(6, 1), people=12, sources=9)
    thin = _account("a2", "SNCF", axes=_axes(1, 6), people=1, sources=0)
    result = normalize_accounts(["a1", "a2"], [documented, thin])
    assert [r["depth"] for r in result["normalization"]] == ["solide", "mince"]
    assert result["comparable_on_equal_footing"] is False


def test_un_compte_non_analyse_ou_introuvable_est_ecarte_avec_sa_raison() -> None:
    analysing = {**_account("a2", "SNCF"), "status": "analyzing"}
    result = normalize_accounts(["a1", "a2", "a3"], [_account("a1", "EDF", axes=_axes(5, 2)), analysing])
    assert [r["company"] for r in result["normalization"]] == ["EDF"]
    assert result["excluded"] == [
        {"account_id": "a2", "company": "SNCF", "reason": "analyse non terminée"},
        {"account_id": "a3", "company": None, "reason": "compte introuvable dans ton espace"},
    ]
    assert result["comparable"] == ["a1"]


# ── Les cinq axes de CONTENU (#2303.4/.6/.10/.15/.16, épopée #2790) ───────────


def _account_with_dossier_read(aid: str, name: str, *, siren: str | None = None, **dossier_read: object) -> dict:
    raw = {"org": {"orgGraph": {"people": []}}, "plan": {"evaluation": {"dossier_read": dossier_read}}}
    account = {"id": aid, "company_name": name, "status": "completed", "raw_analysis": raw}
    if siren:
        account["siren"] = siren
    return account


def test_recours_externe_mesure_cite_l_impact_de_l_axe_dossier() -> None:
    account = _account_with_dossier_read(
        "a1",
        "EDF",
        axes=[{"key": "capacite_achat_externe", "state": "measured", "value": 4, "impact": "ETI déjà outillé"}],
    )
    [row] = normalize_accounts(["a1"], [account])["normalization"]
    assert row["comparison_axes"]["external_recourse"] == {"state": "measured", "value": "ETI déjà outillé"}


def test_recours_externe_partiel_devient_a_verifier_jamais_un_fait_affirme() -> None:
    account = _account_with_dossier_read(
        "a1", "EDF", axes=[{"key": "capacite_achat_externe", "state": "partial", "value": 2}]
    )
    [row] = normalize_accounts(["a1"], [account])["normalization"]
    assert row["comparison_axes"]["external_recourse"] == {"state": "to_verify", "value": "2/5"}


def test_recours_externe_absent_reste_inconnu() -> None:
    account = _account_with_dossier_read("a1", "EDF", axes=[])
    [row] = normalize_accounts(["a1"], [account])["normalization"]
    assert row["comparison_axes"]["external_recourse"] == {"state": "unknown", "value": None}


def test_voie_d_achat_sans_perimetre_ancre_est_non_applicable() -> None:
    account = _account_with_dossier_read("a1", "EDF", access_path="Passer par le RSSI")
    [row] = normalize_accounts(["a1"], [account])["normalization"]
    assert row["perimeter"] is None
    assert row["comparison_axes"]["buying_path"] == {"state": "not_applicable", "value": None}


def test_voie_d_achat_mesuree_avec_perimetre_ancre() -> None:
    account = _account_with_dossier_read("a1", "EDF", siren="552081317", access_path="Passer par le RSSI")
    [row] = normalize_accounts(["a1"], [account])["normalization"]
    assert row["comparison_axes"]["buying_path"] == {"state": "measured", "value": "Passer par le RSSI"}


def test_barriere_de_referencement_non_mesurable_reste_inconnue() -> None:
    account = _account_with_dossier_read("a1", "EDF")
    account["raw_analysis"]["accessBarrier"] = {"measurable": False, "label": None}
    [row] = normalize_accounts(["a1"], [account])["normalization"]
    assert row["comparison_axes"]["referencing_barrier"] == {"state": "unknown", "value": None}


def test_barriere_de_referencement_mesuree() -> None:
    account = _account_with_dossier_read("a1", "EDF")
    account["raw_analysis"]["accessBarrier"] = {"measurable": True, "label": "forte"}
    [row] = normalize_accounts(["a1"], [account])["normalization"]
    assert row["comparison_axes"]["referencing_barrier"] == {"state": "measured", "value": "forte"}


def test_risque_retient_le_plus_grave_nomme() -> None:
    account = _account_with_dossier_read("a1", "EDF")
    account["raw_analysis"]["plan"]["evaluation"]["risks"] = [
        {"risk": "Cycle long", "impact": "modere"},
        {"risk": "Concurrent déjà en place", "impact": "critique"},
    ]
    [row] = normalize_accounts(["a1"], [account])["normalization"]
    assert row["comparison_axes"]["risk"] == {"state": "measured", "value": "Concurrent déjà en place"}


def test_risque_absent_reste_inconnu() -> None:
    account = _account_with_dossier_read("a1", "EDF")
    [row] = normalize_accounts(["a1"], [account])["normalization"]
    assert row["comparison_axes"]["risk"] == {"state": "unknown", "value": None}


def test_premier_test_action_mesure() -> None:
    account = _account_with_dossier_read("a1", "EDF", next_action={"label": "Contacter le RSSI", "route": "/x"})
    [row] = normalize_accounts(["a1"], [account])["normalization"]
    assert row["comparison_axes"]["first_action"] == {"state": "measured", "value": "Contacter le RSSI"}


def test_premier_test_action_sous_no_go_est_non_applicable() -> None:
    account = _account_with_dossier_read(
        "a1",
        "EDF",
        next_action={"label": "Contacter le RSSI"},
        no_go={"temporary": True, "context": "Budget geler", "trigger": "Relancer en janvier"},
    )
    [row] = normalize_accounts(["a1"], [account])["normalization"]
    assert row["comparison_axes"]["first_action"] == {"state": "not_applicable", "value": None}
