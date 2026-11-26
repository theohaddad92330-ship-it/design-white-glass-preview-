"""Classement des candidats registre pour le préremplissage ESN.

Le fil rouge : **on ne choisit jamais en silence**. Le classement doit être
déterministe, explicable, et surtout écarter les entités parasites que la
recherche plein-texte de ``recherche-entreprises.api.gouv.fr`` remonte en
premier (SCI, garages, sociétés immobilières homonymes).

Les trois cas nommés (Carrefour → SCI du Cannet, Michelin → société
immobilière, Alan → garage à Mougins) sont des cas MESURÉS sur l'API réelle :
ils sont ici pour verrouiller le comportement, pas pour décorer.
"""

from __future__ import annotations

import pytest

from app.services.esn_candidate_ranking import (
    AUTO_SELECT_MARGIN,
    AUTO_SELECT_NAME_FLOOR,
    MAX_CANDIDATES,
    esn_naf_fit,
    is_esn_naf,
    naf_family_label,
    naf_label_for_code,
    order_esn_suggestions,
    rank_candidates,
    should_auto_select,
)


def _row(**overrides) -> dict:
    """Une ligne ``recherche_entreprises._candidate`` (mêmes clés camelCase)."""
    row = {
        "source": "recherche-entreprises",
        "siren": "810669754",
        "name": "KICKLOX",
        "legalName": "LINNAEUS",
        "nafCode": "6202A",
        "nafLabel": "Conseil en systèmes et logiciels informatiques",
        "sizeClass": "PME",
        "headcountTranche": "21",
        "establishmentCount": 2,
        "creationDate": "2015-03-01",
        "city": "PARIS",
        "department": "75",
        "isActive": True,
    }
    row.update(overrides)
    return row


# ── Cohérence NAF ────────────────────────────────────────────────────────────


@pytest.mark.parametrize("naf", ["62.01Z", "6202A", "62.09Z", "63.11Z", "63.12Z", "58.29C"])
def test_core_it_naf_is_a_perfect_fit(naf: str) -> None:
    assert esn_naf_fit(naf) == 1.0
    assert is_esn_naf(naf) is True


@pytest.mark.parametrize("naf", ["70.22Z", "71.12B"])
def test_adjacent_consulting_naf_is_plausible_but_not_proof(naf: str) -> None:
    """Conseil / ingénierie : beaucoup d'ESN y sont immatriculées, mais ce n'est
    pas une preuve — score intermédiaire, et surtout PAS d'auto-sélection."""
    assert 0.0 < esn_naf_fit(naf) < 1.0
    assert is_esn_naf(naf) is False


@pytest.mark.parametrize(
    "naf",
    [
        "68.20A",  # location de terrains — la SCI Carrefour du Cannet
        "68.20B",  # société immobilière — l'homonyme Michelin
        "45.20A",  # entretien de véhicules — le garage Alan de Mougins
        "56.10A",  # restauration
        "47.11F",  # hypermarchés
        "43.22B",  # travaux d'installation
        "96.02A",  # coiffure
    ],
)
def test_structurally_incompatible_naf_scores_zero(naf: str) -> None:
    """Aucune ESN n'exerce sous ces codes : le fit tombe à 0, ce qui coûte au
    candidat tout le poids NAF du barème."""
    assert esn_naf_fit(naf) == 0.0
    assert is_esn_naf(naf) is False


@pytest.mark.parametrize("naf", ["", None, "   "])
def test_unknown_naf_is_neutral_not_punished(naf: str | None) -> None:
    """Un NAF absent ne PROUVE rien : il ne doit ni disqualifier (le registre est
    parfois muet) ni fabriquer un écart. `is_esn_naf` rend None = « on ne sait
    pas » — jamais un False qui déclencherait une alerte infondée."""
    assert 0.0 < esn_naf_fit(naf) < 1.0
    assert is_esn_naf(naf) is None


# ── Cas réels : l'entité parasite ne doit jamais finir première ───────────────


def test_carrefour_does_not_resolve_to_the_sci_du_cannet() -> None:
    """Cas mesuré : « Carrefour » remonte la SCI CARREFOUR DU CANNET en top-1."""
    rows = [
        _row(
            siren="352000000",
            name="SCI CARREFOUR DU CANNET",
            legalName="SCI CARREFOUR DU CANNET",
            nafCode="68.20A",
            nafLabel="Location de terrains et d'autres biens immobiliers",
            sizeClass=None,
            headcountTranche="00",
            establishmentCount=1,
            city="LE CANNET",
            department="06",
        ),
        _row(
            siren="652014051",
            name="CARREFOUR",
            legalName="CARREFOUR",
            nafCode="70.10Z",
            nafLabel="Activités des sièges sociaux",
            sizeClass="GE",
            headcountTranche="52",
            establishmentCount=12,
            city="MASSY",
            department="91",
        ),
    ]
    ranked = rank_candidates("Carrefour", rows)

    assert ranked[0].siren == "652014051"
    assert ranked[0].name == "CARREFOUR"
    # ... et comme son NAF n'est pas celui d'une ESN, on ne préremplit pas tout
    # seul : l'utilisateur doit choisir, en étant prévenu.
    assert should_auto_select(ranked) is False
    assert ranked[0].is_esn_naf is False


def test_michelin_does_not_resolve_to_the_real_estate_namesake() -> None:
    rows = [
        _row(
            siren="300000001",
            name="SOCIETE IMMOBILIERE MICHELIN",
            legalName="SOCIETE IMMOBILIERE MICHELIN",
            nafCode="68.20B",
            nafLabel="Location de terrains et d'autres biens immobiliers",
            headcountTranche="00",
            establishmentCount=1,
            city="CLERMONT-FERRAND",
            department="63",
        ),
        _row(
            siren="855200507",
            name="MANUFACTURE FRANCAISE DES PNEUMATIQUES MICHELIN",
            legalName="MANUFACTURE FRANCAISE DES PNEUMATIQUES MICHELIN",
            nafCode="22.11Z",
            nafLabel="Fabrication et rechapage de pneumatiques",
            sizeClass="GE",
            headcountTranche="52",
            establishmentCount=30,
            city="CLERMONT-FERRAND",
            department="63",
        ),
    ]
    ranked = rank_candidates("Michelin", rows)

    assert ranked[0].siren == "855200507"
    assert should_auto_select(ranked) is False


def test_alan_does_not_resolve_to_the_garage_in_mougins() -> None:
    rows = [
        _row(
            siren="400000002",
            name="GARAGE ALAN",
            legalName="GARAGE ALAN",
            nafCode="45.20A",
            nafLabel="Entretien et réparation de véhicules automobiles légers",
            sizeClass=None,
            headcountTranche="01",
            establishmentCount=1,
            city="MOUGINS",
            department="06",
        ),
        _row(
            siren="815056807",
            name="ALAN",
            legalName="ALAN",
            nafCode="65.12Z",
            nafLabel="Autres assurances",
            sizeClass="ETI",
            headcountTranche="32",
            establishmentCount=3,
            city="PARIS",
            department="75",
        ),
    ]
    ranked = rank_candidates("Alan", rows)

    assert ranked[0].siren == "815056807"
    assert should_auto_select(ranked) is False


def test_an_it_entity_outranks_a_bigger_namesake_from_another_sector() -> None:
    """Le cœur du barème : à nom équivalent, le NAF informatique l'emporte sur la
    seule taille. C'est ce qui distingue ce classement de la désambiguïsation
    « quel THALES est mon prospect » (où la taille prime)."""
    rows = [
        _row(
            siren="500000003",
            name="NOVATEK",
            legalName="NOVATEK",
            nafCode="41.20A",
            nafLabel="Construction de maisons individuelles",
            sizeClass="GE",
            headcountTranche="52",
            establishmentCount=25,
        ),
        _row(siren="500000004", name="NOVATEK", legalName="NOVATEK", nafCode="62.02A", headcountTranche="12"),
    ]
    ranked = rank_candidates("Novatek", rows)

    assert ranked[0].siren == "500000004"
    assert ranked[0].is_esn_naf is True


# ── Statut administratif ─────────────────────────────────────────────────────


def test_ceased_entities_are_never_proposed() -> None:
    """Proposer une coquille radiée comme « votre entreprise » est pire que de ne
    rien proposer — même règle que l'autocomplétion."""
    rows = [
        _row(siren="600000001", name="KICKLOX", isActive=False),
        _row(siren="810669754", name="KICKLOX", isActive=True),
    ]
    ranked = rank_candidates("Kicklox", rows)

    assert [c.siren for c in ranked] == ["810669754"]


def test_all_ceased_yields_no_candidate_rather_than_a_dead_shell() -> None:
    ranked = rank_candidates("Kicklox", [_row(isActive=False)])
    assert ranked == []


def test_rows_without_a_siren_are_dropped() -> None:
    """Sans SIREN un candidat n'est pas sélectionnable — on ne l'affiche pas."""
    assert rank_candidates("Kicklox", [_row(siren=""), _row(siren=None)]) == []


def test_same_siren_is_never_listed_twice() -> None:
    ranked = rank_candidates("Kicklox", [_row(), _row(nafCode="70.22Z")])
    assert len(ranked) == 1


# ── Similarité de nom : nom complet ET dénomination ──────────────────────────


def test_name_is_matched_against_both_the_trade_name_and_the_legal_name() -> None:
    """« Kicklox » est la MARQUE ; la raison sociale est LINNAEUS. Le classement
    doit reconnaître l'entité par l'un OU l'autre — sinon le cas le plus courant
    (marque ≠ raison sociale) sort du classement."""
    by_trade_name = rank_candidates("Kicklox", [_row(name="LINNAEUS", legalName="KICKLOX")])
    by_full_name = rank_candidates("Linnaeus", [_row(name="LINNAEUS", legalName="KICKLOX")])

    assert by_trade_name[0].name_score == pytest.approx(1.0)
    assert by_full_name[0].name_score == pytest.approx(1.0)


def test_a_name_that_does_not_resemble_the_query_is_filtered_out() -> None:
    """La recherche plein-texte matche sur l'objet social : elle remonte des
    sociétés dont le NOM n'a rien à voir. On ne les propose pas."""
    assert rank_candidates("Kicklox", [_row(name="BOULANGERIE DUPONT", legalName="BOULANGERIE DUPONT")]) == []


def test_legal_form_suffixes_do_not_penalise_the_match() -> None:
    ranked = rank_candidates("Kicklox", [_row(name="KICKLOX SAS", legalName="KICKLOX SAS")])
    assert ranked[0].name_score == pytest.approx(1.0)


# ── Taille / empreinte : départage à nom et NAF égaux ────────────────────────


def test_a_zero_employee_shell_ranks_below_a_staffed_namesake() -> None:
    """0 salarié est la signature d'une SCI / holding dormante : plausible pour
    une société, pas pour l'ESN dans laquelle le commercial travaille."""
    rows = [
        _row(siren="700000001", headcountTranche="00", establishmentCount=1),
        _row(siren="700000002", headcountTranche="12", establishmentCount=1),
    ]
    ranked = rank_candidates("Kicklox", rows)
    assert [c.siren for c in ranked] == ["700000002", "700000001"]


def test_unknown_headcount_never_manufactures_a_margin() -> None:
    """Deux homonymes de taille inconnue restent à égalité → ambigu, pas de choix
    au hasard."""
    rows = [
        _row(siren="700000003", headcountTranche="NN", establishmentCount=None),
        _row(siren="700000004", headcountTranche=None, establishmentCount=None),
    ]
    ranked = rank_candidates("Kicklox", rows)

    assert ranked[0].score == pytest.approx(ranked[1].score)
    assert should_auto_select(ranked) is False


# ── Liste renvoyée ───────────────────────────────────────────────────────────


def test_the_list_is_capped_and_sorted_by_score() -> None:
    rows = [_row(siren=f"81066975{i}") for i in range(9)]
    ranked = rank_candidates("Kicklox", rows)

    assert len(ranked) == MAX_CANDIDATES
    assert [c.score for c in ranked] == sorted((c.score for c in ranked), reverse=True)


def test_a_candidate_carries_every_discriminating_fact() -> None:
    """Ce que l'utilisateur doit pouvoir lire pour trancher — et rien d'inventé."""
    candidate = rank_candidates("Kicklox", [_row()])[0]

    assert candidate.siren == "810669754"
    assert candidate.name == "KICKLOX"
    assert candidate.city == "PARIS"
    assert candidate.department == "75"
    assert candidate.naf_code == "6202A"
    assert candidate.naf_label == "Conseil en systèmes et logiciels informatiques"
    assert candidate.is_esn_naf is True
    assert candidate.headcount_label == "50 à 99 salariés"
    assert candidate.establishment_count == 2
    assert candidate.creation_date == "2015-03-01"
    assert 0.0 <= candidate.score <= 1.0


def test_absent_facts_stay_absent_and_are_never_filled_in() -> None:
    candidate = rank_candidates(
        "Kicklox",
        [_row(city=None, department=None, nafCode=None, nafLabel=None, headcountTranche="NN", establishmentCount=None)],
    )[0]

    assert candidate.city is None
    assert candidate.department is None
    assert candidate.naf_code is None
    assert candidate.naf_label is None
    assert candidate.headcount_label is None
    assert candidate.establishment_count is None
    assert candidate.is_esn_naf is None


def test_naf_label_is_decoded_from_the_code_when_the_registry_omits_it() -> None:
    """Constaté en vrai : le registre renvoie le code sans son libellé. Décoder
    une nomenclature publique n'est pas inventer une donnée."""
    candidate = rank_candidates("Kicklox", [_row(nafLabel=None, nafCode="62.01Z")])[0]
    assert candidate.naf_label == "Programmation informatique"


def test_empty_input_yields_an_empty_list() -> None:
    assert rank_candidates("Kicklox", []) == []
    assert rank_candidates("", [_row()]) == []


# ── Règle d'auto-sélection ───────────────────────────────────────────────────


def test_a_single_plausible_candidate_is_auto_selected() -> None:
    """Rien à départager : la carte de confirmation reste l'accord explicite de
    l'utilisateur, une liste d'un seul élément n'apporterait rien."""
    assert should_auto_select(rank_candidates("Kicklox", [_row()])) is True


def test_a_single_candidate_is_auto_selected_even_with_an_odd_naf() -> None:
    """Il n'y a pas de choix à offrir. Le doute est signalé ailleurs, par
    ``is_esn_naf`` — masquer l'entité serait pire que la montrer avec l'alerte."""
    ranked = rank_candidates("Kicklox", [_row(nafCode="68.20A", nafLabel=None)])
    assert should_auto_select(ranked) is True
    assert ranked[0].is_esn_naf is False


def test_a_dominant_it_candidate_is_auto_selected() -> None:
    rows = [
        _row(siren="810669754", name="KICKLOX", nafCode="6202A", headcountTranche="21", establishmentCount=3),
        _row(siren="810669755", name="KICKLOX IMMOBILIER", nafCode="68.20A", headcountTranche="00"),
    ]
    ranked = rank_candidates("Kicklox", rows)

    assert ranked[0].siren == "810669754"
    assert should_auto_select(ranked) is True


def test_two_credible_it_namesakes_are_never_auto_selected() -> None:
    """Deux ESN homonymes : c'est exactement le cas où un choix silencieux part
    de travers, et où l'utilisateur est le seul à pouvoir trancher."""
    rows = [
        _row(siren="810669754", name="NOVATEK", nafCode="6202A", headcountTranche="12", establishmentCount=2),
        _row(siren="810669755", name="NOVATEK", nafCode="6201Z", headcountTranche="12", establishmentCount=2),
    ]
    ranked = rank_candidates("Novatek", rows)

    assert len(ranked) == 2
    assert should_auto_select(ranked) is False


def test_a_weak_name_match_is_never_auto_selected() -> None:
    """Le premier de plusieurs mauvais matchs reste un mauvais match."""
    rows = [
        _row(siren="810669754", name="KICKLOX TECHNOLOGIES FRANCE SERVICES", nafCode="6202A"),
        _row(siren="810669755", name="KICKLOX GROUPE HOLDING INTERNATIONAL", nafCode="68.20A"),
    ]
    ranked = rank_candidates("Kicklox", rows)

    assert ranked[0].name_score < AUTO_SELECT_NAME_FLOOR
    assert should_auto_select(ranked) is False


def test_no_candidate_means_no_auto_selection() -> None:
    assert should_auto_select([]) is False


def test_auto_selection_thresholds_are_explicit_constants() -> None:
    """Le barème doit rester lisible et réglable — pas des nombres magiques
    dispersés dans le code."""
    assert 0.0 < AUTO_SELECT_MARGIN < 1.0
    assert 0.0 < AUTO_SELECT_NAME_FLOOR <= 1.0


# ── Ordonnancement de l'autocomplete ─────────────────────────────────────────
#
# Même barème que le classement, mais l'autocomplete a deux contraintes propres :
# l'utilisateur TAPE (la saisie est un préfixe, pas un nom complet), et on ne
# supprime JAMAIS une ligne — on la classe. Une ESN peut avoir un NAF atypique ;
# masquer un résultat correct est pire que de le mettre en bas.


def test_autocomplete_never_drops_a_suggestion() -> None:
    """Le garde-fou central : on réordonne, on ne filtre pas."""
    rows = [
        _row(siren="700000001", name="SCI CARREFOUR DU CANNET", legalName="SCI CARREFOUR DU CANNET", nafCode="68.20A"),
        _row(siren="700000002", name="CARREFOUR", legalName="CARREFOUR", nafCode="70.10Z"),
        _row(siren="700000003", name="BOULANGERIE DUPONT", legalName="BOULANGERIE DUPONT", nafCode="10.71C"),
    ]
    ordered = order_esn_suggestions("Carrefour", rows)

    assert len(ordered) == len(rows)
    assert {r["siren"] for r in ordered} == {"700000001", "700000002", "700000003"}


def test_autocomplete_pushes_the_sci_below_the_real_company() -> None:
    rows = [
        _row(siren="700000001", name="SCI CARREFOUR DU CANNET", legalName="SCI CARREFOUR DU CANNET", nafCode="68.20A",
             headcountTranche="00", establishmentCount=1),
        _row(siren="700000002", name="CARREFOUR", legalName="CARREFOUR", nafCode="70.10Z",
             headcountTranche="52", establishmentCount=12),
    ]
    ordered = order_esn_suggestions("Carrefour", rows)

    assert [r["siren"] for r in ordered] == ["700000002", "700000001"]


def test_autocomplete_ranks_an_it_entity_first() -> None:
    rows = [
        _row(siren="700000001", name="NOVATEK IMMOBILIER", legalName="NOVATEK IMMOBILIER", nafCode="68.20A"),
        _row(siren="700000002", name="NOVATEK", legalName="NOVATEK", nafCode="62.02A"),
    ]
    ordered = order_esn_suggestions("Novatek", rows)
    assert [r["siren"] for r in ordered] == ["700000002", "700000001"]


@pytest.mark.parametrize("typed", ["Ki", "Kick", "Kicklo", "Kicklox"])
def test_autocomplete_handles_a_partial_query_as_the_user_types(typed: str) -> None:
    """La saisie est un PRÉFIXE : « Ki » ne ressemble pas à « KICKLOX » au sens
    d'une distance d'édition, mais c'est bien la bonne entreprise. Un plancher
    de similarité de nom viderait la liste déroulante."""
    rows = [
        _row(siren="700000001", name="KICKLOX IMMOBILIER", legalName="KICKLOX IMMOBILIER", nafCode="68.20A",
             headcountTranche="00"),
        _row(siren="700000002", name="KICKLOX", legalName="KICKLOX", nafCode="62.02A", headcountTranche="21"),
    ]
    ordered = order_esn_suggestions(typed, rows)

    assert len(ordered) == 2
    assert ordered[0]["siren"] == "700000002"


def test_autocomplete_is_stable_when_nothing_separates_two_rows() -> None:
    """À score égal, l'ordre du registre est conservé — pas de réordonnancement
    arbitraire d'un appel à l'autre."""
    rows = [_row(siren="700000001"), _row(siren="700000002")]
    assert [r["siren"] for r in order_esn_suggestions("Kicklox", rows)] == ["700000001", "700000002"]


def test_autocomplete_leaves_the_rows_untouched() -> None:
    """L'ordonnancement ne réécrit aucune ligne : ce sont les mêmes objets."""
    rows = [_row(siren="700000001"), _row(siren="700000002")]
    ordered = order_esn_suggestions("Kicklox", rows)
    assert all(any(r is original for original in rows) for r in ordered)


def test_autocomplete_tolerates_an_empty_input() -> None:
    assert order_esn_suggestions("Kicklox", []) == []
    assert order_esn_suggestions("", []) == []


def test_autocomplete_keeps_rows_the_query_does_not_resemble_at_all() -> None:
    """Une ESN peut porter un nom qui ne ressemble pas à la marque tapée
    (Kicklox → LINNAEUS). On la garde, quitte à la classer bas."""
    rows = [_row(siren="700000001", name="LINNAEUS", legalName="LINNAEUS", nafCode="62.02A")]
    assert len(order_esn_suggestions("Kicklox", rows)) == 1


# ── Libellé de secteur affichable ────────────────────────────────────────────


@pytest.mark.parametrize(
    ("naf", "expected"),
    [
        ("68.20A", "Activités immobilières"),
        ("45.20A", "Commerce et réparation automobile"),
        ("56.10A", "Hébergement et restauration"),
        ("41.20A", "Construction"),
        ("70.22Z", "Conseil de gestion"),
    ],
)
def test_naf_family_label_makes_a_non_it_row_readable(naf: str, expected: str) -> None:
    """Sans libellé, une ligne « SCI CARREFOUR DU CANNET · Le Cannet » n'a aucun
    signal de secteur — le commercial ne peut pas l'écarter d'un coup d'œil. On
    décode la DIVISION NAF (nomenclature publique), on n'invente rien."""
    assert naf_family_label(naf) == expected


@pytest.mark.parametrize("naf", ["", None, "99.99Z"])
def test_naf_family_label_is_absent_when_undecodable(naf: str | None) -> None:
    assert naf_family_label(naf) is None


def test_precise_it_label_still_wins_over_the_family_label() -> None:
    assert naf_label_for_code("62.02A") == "Conseil en systèmes et logiciels informatiques"
    assert naf_family_label("62.02A") == "Programmation, conseil et autres activités informatiques"
