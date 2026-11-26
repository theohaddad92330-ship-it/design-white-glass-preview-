"""#4892.3 / #4842.2 — une recherche par NOM : seules les raisons sociales qui CONTIENNENT le nom (mot entier)
restent, et toutes se regroupent sous une tête. Proposé, jamais fusionné."""

from __future__ import annotations

from app.services.brand_grouping import group_by_brand, keep_named

NOISE = ["LORIBAM", "DECAILLON ROMAIN", "DECATRON", "EDUCATHLON", "LUCATHLON", "MECATHLON", "S.N.C. DECAILLON"]
BRAND = [
    ("DECATHLON FRANCE", "500569405", "10 000 salariés et plus"),
    ("BEL DECATHLON", "2", None),
    ("FONDATION D'ENTREPRISE DECATHLON", "3", None),
    ("MONTPELLIER DECATHLON ELITE", "4", None),
    ("SCI DECATHLON - SALVA", "5", None),
]


def _rows() -> list[dict]:
    rows = [{"name": n, "siren": s, "headcountRange": h} for n, s, h in BRAND]
    rows += [{"name": n, "siren": str(100 + i)} for i, n in enumerate(NOISE)]
    return rows


def test_4842_2_le_bruit_phonetique_sort() -> None:
    kept = keep_named(_rows(), "Decathlon")
    assert [r["name"] for r in kept] == [n for n, _, _ in BRAND]


def test_4842_2_accents_et_casse_ignores() -> None:
    assert [r["name"] for r in keep_named([{"name": "Éducathlon"}, {"name": "ÉCOLE DÉCATHLON"}], "decathlon")] == [
        "ÉCOLE DÉCATHLON"
    ]


def test_4842_2_aucune_correspondance_ne_vide_pas_la_liste() -> None:
    """Faute de frappe : le registre a trouvé par proximité, on ne vide pas la réponse."""
    rows = [{"name": "DECATHLON FRANCE", "siren": "1"}]
    assert keep_named(rows, "Decatlon") == rows


def test_4892_3_la_marque_se_regroupe_sous_le_nom_cherche() -> None:
    rows = keep_named(_rows(), "Decathlon")
    group_by_brand(rows, searched="Decathlon")
    head = rows[0]
    assert head["brandGroup"]["role"] == "head"
    assert {m["siren"] for m in head["brandGroup"]["members"]} == {"2", "3", "4", "5"}
    assert all(r["brandGroup"] == {"role": "member", "headSiren": "500569405", "headName": rows[0]["name"]} for r in rows[1:])


def test_4892_3_sans_nom_la_regle_du_lot_d_reste() -> None:
    rows = [{"name": "BEL DECATHLON", "siren": "2"}, {"name": "SCI DECATHLON - SALVA", "siren": "5"}]
    group_by_brand(rows)
    assert all("brandGroup" not in r for r in rows)
