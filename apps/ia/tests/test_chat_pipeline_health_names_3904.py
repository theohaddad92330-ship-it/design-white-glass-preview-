"""#3904 — « Lequel de mes comptes est à deux doigts de signer ? » : le diagnostic de
pipe nomme le compte de chaque affaire (avant, seulement un identifiant)."""

from app.services.chat_tools import _named_pipeline_rows

NAMES = {"opp-1": {"accountId": "acc-1", "companyName": "Altran", "label": "Renfort data"}}


def test_la_ligne_porte_le_compte_et_le_libelle():
    rows = _named_pipeline_rows([{"id": "opp-1", "stage": "negotiation"}], NAMES)
    assert rows == [
        {"id": "opp-1", "stage": "negotiation", "accountId": "acc-1", "companyName": "Altran", "label": "Renfort data"}
    ]


def test_une_affaire_inconnue_reste_telle_quelle_jamais_un_compte_devine():
    rows = _named_pipeline_rows([{"id": "opp-2", "stage": "negotiation"}], NAMES)
    assert rows == [{"id": "opp-2", "stage": "negotiation"}]


def test_sans_noms_du_pont_les_lignes_sont_inchangees():
    assert _named_pipeline_rows([{"id": "opp-1"}], None) == [{"id": "opp-1"}]
