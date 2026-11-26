"""#1084 — « Étrange le résultat pour une mutuelle KLESIA ».

Les « comptes du même secteur » d'un dossier remontaient PINHEIRO PHILIPPE et
GINA ILANN : des entrepreneurs individuels, sous le NAF fourre-tout « autres
activités de soutien aux entreprises ». Le registre répondait à la question
posée ; c'est la question qui était incomplète — exactement le défaut que
`account_qualification` corrige depuis l'addendum p33-40.

La règle EXISTAIT, testée, avec ses codes d'exclusion. Elle n'avait qu'UN
appelant (`routers/discover.py`), et `/companies/discover` — celui que
`listSimilarToAccount` interroge — passait à côté. Un chemin corrigé, l'autre
laissé vivant : la famille de défauts la plus chère du dépôt.
"""

from __future__ import annotations

from app.routers.companies import qualified_suggestions
from app.services.pappers.models import CompanySearchHit


def _hit(**kwargs) -> CompanySearchHit:
    base = {"siren": "000000000", "nom_entreprise": "ACME", "categorie_juridique": "5710"}
    return CompanySearchHit.model_validate({**base, **kwargs})


def test_le_hit_porte_la_categorie_juridique_du_registre() -> None:
    # Le champ était jeté à la validation : sans lui, aucune exclusion prouvée
    # n'est possible en aval.
    assert _hit(categorie_juridique="1000").legal_category == "1000"
    assert _hit(forme_juridique="Entrepreneur individuel").legal_form == "Entrepreneur individuel"


def test_une_personne_physique_est_ecartee() -> None:
    hits = [
        _hit(siren="111111111", nom_entreprise="PINHEIRO PHILIPPE", categorie_juridique="1000"),
        _hit(siren="222222222", nom_entreprise="AG2R LA MONDIALE", categorie_juridique="5710"),
    ]
    kept = [h.legal_name for h in qualified_suggestions(hits)]
    assert kept == ["AG2R LA MONDIALE"]


def test_une_indivision_est_ecartee() -> None:
    hits = [_hit(siren="333333333", nom_entreprise="INDIVISION DEGREMONT", categorie_juridique="2210")]
    assert qualified_suggestions(hits) == []


def test_une_entite_cessee_est_ecartee() -> None:
    hits = [_hit(siren="444444444", entreprise_cessee=True)]
    assert qualified_suggestions(hits) == []


def test_le_nom_seul_n_ecarte_JAMAIS() -> None:
    """Le garde-fou de ce correctif, écrit après s'être trompé une fois.

    L'heuristique « ce nom ressemble à une personne » range MALAKOFF HUMANIS et
    AG2R LA MONDIALE parmi les personnes : deux ou trois mots, aucune forme
    sociale. Ce sont précisément les comptes que le testeur voulait voir. Écarter
    sur le nom aurait rendu #1084 pire — on n'exclut que sur PREUVE, c'est-à-dire
    sur ce que le registre DIT, jamais sur ce qu'un nom laisse penser.
    """
    hits = [
        _hit(siren="555555555", nom_entreprise="GINA ILANN", categorie_juridique=None),
        _hit(siren="666666666", nom_entreprise="MALAKOFF HUMANIS", categorie_juridique=None),
        _hit(siren="999999999", nom_entreprise="AG2R LA MONDIALE", categorie_juridique=None),
    ]
    kept = [h.legal_name for h in qualified_suggestions(hits)]
    assert kept == ["GINA ILANN", "MALAKOFF HUMANIS", "AG2R LA MONDIALE"]


def test_la_categorie_juridique_tranche_la_ou_le_nom_ne_peut_pas() -> None:
    # Même nom en deux mots, deux verdicts : c'est le REGISTRE qui dit lequel
    # est une personne, pas la forme du libellé.
    hits = [
        _hit(siren="555555555", nom_entreprise="GINA ILANN", categorie_juridique="1000"),
        _hit(siren="666666666", nom_entreprise="MALAKOFF HUMANIS", categorie_juridique="5710"),
    ]
    kept = [h.legal_name for h in qualified_suggestions(hits)]
    assert kept == ["MALAKOFF HUMANIS"]


def test_une_microstructure_reste_proposee() -> None:
    # « Il exclut peu, et seulement sur preuve » : un cabinet de trois personnes
    # achète. Le doute ne se transforme pas en exclusion.
    hits = [_hit(siren="777777777", nom_entreprise="MARTIN DUPONT CONSEIL", categorie_juridique="5499")]
    assert [h.legal_name for h in qualified_suggestions(hits)] == ["MARTIN DUPONT CONSEIL"]


def test_un_doublon_de_siren_ne_passe_pas_deux_fois() -> None:
    hits = [_hit(siren="888888888"), _hit(siren="888888888")]
    assert len(qualified_suggestions(hits)) == 1
