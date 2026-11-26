"""#4892.1 — une marque = une ligne : plusieurs entités juridiques d'une même marque (DECATHLON FRANCE + DECATHLON,
deux SIREN, même ville) sont PROPOSÉES au regroupement d'affichage. Jamais une fusion en base (doctrine)."""

from __future__ import annotations

from app.services.brand_grouping import group_by_brand


def _c(name: str, siren: str, city: str = "VILLENEUVE-D'ASCQ", headcount: str | None = None, **extra) -> dict:
    return {"name": name, "siren": siren, "city": city, "headcountRange": headcount, **extra}


def test_decathlon_deux_entites_une_marque() -> None:
    rows = [
        _c("DECATHLON FRANCE", "500569405", headcount="10 000 salariés et plus"),
        _c("AUTRE SOCIETE", "111111111", city="LILLE"),
        _c("DECATHLON", "306138900"),
    ]
    group_by_brand(rows)
    head, other, member = rows
    assert head["brandGroup"] == {"role": "head", "members": [{"siren": "306138900", "name": "DECATHLON"}]}
    assert member["brandGroup"] == {"role": "member", "headSiren": "500569405", "headName": "DECATHLON FRANCE"}
    assert "brandGroup" not in other
    # rien n'est fusionné : deux SIREN distincts, chacun garde ses champs
    assert head["siren"] != member["siren"]


def test_4892_2_la_meme_marque_dans_deux_villes_est_proposee() -> None:
    """Lot D (Louis 31/10) — revient sur le seau « même ville » de #4892.1."""
    rows = [_c("DECATHLON FRANCE", "1", city="LILLE"), _c("DECATHLON", "2", city="LYON")]
    group_by_brand(rows)
    assert rows[0]["brandGroup"]["role"] in ("head", "member")
    assert rows[1]["brandGroup"]["role"] in ("head", "member")


def test_4892_2_treize_decathlon_de_villes_differentes_une_tete_douze_membres() -> None:
    names = ["DECATHLON FRANCE", "DECATHLON LOGISTIQUE", "DECATHLON", "DECATHLON DIGITAL", "DECATHLON PRODUCTION"]
    rows = [_c(names[i % len(names)], str(100 + i), city=f"VILLE{i}") for i in range(13)]
    rows[0]["headcountRange"] = "10 000 salariés et plus"
    group_by_brand(rows)
    heads = [r for r in rows if r["brandGroup"]["role"] == "head"]
    assert len(heads) == 1 and heads[0]["siren"] == "100"
    assert len(heads[0]["brandGroup"]["members"]) == 12
    assert sum(r["brandGroup"]["role"] == "member" for r in rows) == 12


def test_deux_noms_voisins_ne_se_regroupent_pas() -> None:
    # Premier mot de moins de 6 lettres : trop court pour valoir une marque à lui seul (#4892.2).
    rows = [_c("ACME BUSINESS", "1"), _c("ACME CONSULTING", "2")]
    group_by_brand(rows)
    assert all("brandGroup" not in r for r in rows)
    # Un premier mot de 6 lettres ou plus EST une marque proposée.
    rows = [_c("ORANGE BUSINESS", "1"), _c("ORANGE CONSULTING", "2")]
    group_by_brand(rows)
    assert all("brandGroup" in r for r in rows)


def test_meme_siren_jamais_groupe() -> None:
    rows = [_c("DECATHLON", "1"), _c("DECATHLON", "1")]
    group_by_brand(rows)
    assert all("brandGroup" not in r for r in rows)
