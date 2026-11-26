"""#4631 / #4421.3 / #4408 — le nombre ANNONCÉ et la liste RENDUE sortent du MÊME prédicat.

Défaut mesuré en prod le 26/10 : la prose de Laura annonce « 10 employeurs », l'écran rend 0 table. Cause : le
compte de la lecture (`_count_talent`) comptait les comptes NOMMÉS de l'outil, la carte les validait d'un bloc — un
seul texte refusé (ex. une mention de probabilité) faisait tomber les dix. Désormais : la carte se valide LIGNE À
LIGNE, le compte de la lecture est celui des lignes rendues, et ce qui n'a pas pu l'être se DIT (combien).
Jamais un compte, un contact ou une date inventés pour remplir."""

from __future__ import annotations

from typing import Any

from app.services.known_shape_gate import shape_read_from_tool

CONSULTANT = {"id": "11111111-1111-4111-8111-111111111111", "name": "Hugo Houyez"}


def _account(name: str, why: str = "Compétence demandée sur le 59.") -> dict[str, Any]:
    return {"name": name, "why": [why], "observed_on": "2026-10-19", "not_evaluated": []}


def _output(accounts: list[dict[str, Any]]) -> dict[str, Any]:
    return {"status": "ok", "consultant": CONSULTANT, "accounts": accounts, "limits": []}


def _read(accounts: list[dict[str, Any]], language: str = "fr") -> dict[str, Any]:
    read = shape_read_from_tool("find_accounts_for_talent", _output(accounts), language=language)
    assert read is not None
    return read


def _items(read: dict[str, Any]) -> list[dict[str, Any]]:
    card = read["blocks"].get("account_ranking")
    return card["items"] if card else []


def test_4631_le_compte_annonce_est_celui_des_lignes_rendues() -> None:
    read = _read([_account(f"Employeur {i}") for i in range(10)])
    assert len(_items(read)) == 10
    assert read["count"] == len(_items(read))


def test_4631_une_ligne_refusee_ne_fait_pas_tomber_les_neuf_autres() -> None:
    # « 90 % de chance » : une probabilité — jamais affichée (doctrine) — refuse CETTE ligne seulement.
    accounts = [_account(f"Employeur {i}") for i in range(9)] + [_account("Piégé SA", "90 % de chances de closing.")]
    read = _read(accounts)
    assert [i["name"] for i in _items(read)] == [f"Employeur {i}" for i in range(9)]
    assert read["count"] == 9


def test_4631_ce_qui_n_est_pas_rendu_se_dit_avec_son_nombre() -> None:
    accounts = [_account(f"Employeur {i}") for i in range(9)] + [_account("Piégé SA", "90 % de chances de closing.")]
    card = _read(accounts)["blocks"]["account_ranking"]
    said = " ".join(card.get("not_evaluated", []))
    assert "1 compte" in said and "Piégé SA" not in said  # le nombre, jamais le contenu refusé


def test_4631_liste_vide_le_compte_est_zero_pas_le_nombre_de_l_outil() -> None:
    # Dix comptes lus, aucun ne passe : rien n'est rendu, le compte de la lecture est 0 (porte d'absence).
    read = _read([_account(f"Piégé {i}", "Probabilité de closing élevée.") for i in range(10)])
    assert _items(read) == []
    assert read["count"] == 0


def test_4631_sait_dire_non_aucun_compte_annonce_sans_ligne() -> None:
    # La garde : pour TOUTE composition, count == len(lignes rendues) et rendu + écartés == lus.
    for bad in range(0, 11):
        accounts = [_account(f"Ok {i}") for i in range(10 - bad)] + [_account(f"Ko {i}", "Probabilité de closing élevée.") for i in range(bad)]
        read = _read(accounts)
        assert read["count"] == len(_items(read)) == 10 - bad


def test_4631_parite_en() -> None:
    accounts = [_account("A"), _account("B", "High likelihood of closing.")]
    card = _read(accounts, language="en")["blocks"]["account_ranking"]
    assert "1 account" in " ".join(card.get("not_evaluated", []))


def test_4631_liste_vide_le_texte_ne_promet_rien_la_carte_dit_combien_n_ont_pas_passe() -> None:
    from app.services.known_shape_gate import _absence_card, _labels

    read = _read([_account(f"Piégé {i}", "Probabilité de closing élevée.") for i in range(10)])
    assert read["unlisted"] == 10
    said = _absence_card([read], _labels("fr"))["missing"][0]["what"]  # type: ignore[index]
    assert "10 lus" in said and "sans aucun résultat" not in said


def test_4631_sait_dire_non_un_vrai_vide_garde_sa_phrase() -> None:
    from app.services.known_shape_gate import _absence_card, _labels

    read = _read([])
    assert read["count"] == 0 and "unlisted" not in read
    said = _absence_card([read], _labels("fr"))["missing"][0]["what"]  # type: ignore[index]
    assert "sans aucun résultat" in said


def test_4631_les_gabarits_a_nombre_sont_alimentes_par_la_collection_rendue() -> None:
    # Garde : un gabarit `{n}` du gate ne se formate qu'avec un nombre dérivé des lignes rendues / écartées.
    import inspect

    import app.services.known_shape_gate as gate

    source = inspect.getsource(gate)
    assert 'labels["talent_dropped_one" if dropped == 1 else "talent_dropped_other"].format(n=dropped)' in source
    assert "len(_talent_items(output))" not in inspect.getsource(gate._talent_ranking)
