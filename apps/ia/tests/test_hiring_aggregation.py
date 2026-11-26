"""#3204.6/.7 (épopée #3238) — TEAM_GROWTH_SIGNAL, cite les offres qui le soutiennent."""

from __future__ import annotations

from app.services.hiring_aggregation import aggregate_replacement_signals, aggregate_team_growth


def _offer(
    label: str, date: str, *, job_family: str | None, hiring_class: str | None, replacement: bool = False
) -> dict:
    return {
        "type": "hiring",
        "label": label,
        "date": date,
        "jobFamily": job_family,
        "hiringSignalClass": hiring_class,
        "replacementSignal": replacement,
    }


def test_deux_offres_internal_hiring_de_la_meme_famille_forment_un_signal() -> None:
    signals = [
        _offer("Data Engineer", "2026-09-01", job_family="data_ia", hiring_class="internal_hiring"),
        _offer("Data Scientist", "2026-08-15", job_family="data_ia", hiring_class="internal_hiring"),
    ]
    result = aggregate_team_growth(signals)
    assert len(result) == 1
    assert result[0]["aggregateClass"] == "team_growth_signal"
    assert result[0]["jobFamily"] == "data_ia"
    # Cite les offres qui la soutiennent, triées de la plus fraîche à la plus ancienne.
    assert [o["label"] for o in result[0]["supportingOffers"]] == ["Data Engineer", "Data Scientist"]


def test_une_seule_offre_ne_forme_pas_un_signal_agrege() -> None:
    signals = [_offer("Data Engineer", "2026-09-01", job_family="data_ia", hiring_class="internal_hiring")]
    assert aggregate_team_growth(signals) == []


def test_une_offre_contracting_ne_compte_pas_pour_une_croissance_d_effectif() -> None:
    # RÈGLE : plusieurs recrutements peuvent indiquer une croissance, PAS un
    # recours à l'externe — une offre de prestation ne prouve rien d'un effectif.
    signals = [
        _offer("Data Engineer", "2026-09-01", job_family="data_ia", hiring_class="internal_hiring"),
        _offer("Consultant Data (prestation)", "2026-08-15", job_family="data_ia", hiring_class="contracting"),
    ]
    assert aggregate_team_growth(signals) == []


def test_deux_familles_differentes_ne_se_melangent_jamais() -> None:
    signals = [
        _offer("Data Engineer", "2026-09-01", job_family="data_ia", hiring_class="internal_hiring"),
        _offer("DevOps", "2026-08-20", job_family="infrastructure_cloud", hiring_class="internal_hiring"),
    ]
    assert aggregate_team_growth(signals) == []


def test_famille_absente_n_est_jamais_devinee() -> None:
    signals = [
        _offer("Développeur", "2026-09-01", job_family=None, hiring_class="internal_hiring"),
        _offer("Développeur", "2026-08-20", job_family=None, hiring_class="internal_hiring"),
    ]
    assert aggregate_team_growth(signals) == []


# ── #3204.7 (épopée #3238, reste du 30/09) — REPLACEMENT_SIGNAL ────────────
#
# À la différence de TEAM_GROWTH_SIGNAL, UNE seule offre suffit : la preuve
# est le marqueur EXPLICITE du texte (`derive_replacement_signal`), jamais
# une récurrence — la RÈGLE de la spec interdit justement de déduire un
# remplacement d'un volume d'offres.


def test_une_seule_offre_marquee_replacement_suffit() -> None:
    signals = [
        _offer("Data Engineer", "2026-09-01", job_family="data_ia", hiring_class="internal_hiring", replacement=True)
    ]
    result = aggregate_replacement_signals(signals)
    assert len(result) == 1
    assert result[0]["aggregateClass"] == "replacement_signal"
    assert [o["label"] for o in result[0]["supportingOffers"]] == ["Data Engineer"]


def test_aucune_offre_marquee_ne_rend_rien() -> None:
    signals = [
        _offer("Data Engineer", "2026-09-01", job_family="data_ia", hiring_class="internal_hiring", replacement=False)
    ]
    assert aggregate_replacement_signals(signals) == []


def test_chaque_offre_marquee_produit_sa_propre_entree() -> None:
    signals = [
        _offer("Data Engineer", "2026-09-01", job_family="data_ia", hiring_class="internal_hiring", replacement=True),
        _offer(
            "Chef de projet", "2026-08-15", job_family="gestion_projet", hiring_class="internal_hiring", replacement=True
        ),
    ]
    result = aggregate_replacement_signals(signals)
    assert len(result) == 2
    assert {r["supportingOffers"][0]["label"] for r in result} == {"Data Engineer", "Chef de projet"}
