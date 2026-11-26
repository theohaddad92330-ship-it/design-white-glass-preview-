"""#4429.2 (recette prod 23/10, FAIL) — « Toulouse » rendait 9-10 comptes SANS élargir, le seuil valant 10.

Cause : le palier suivant se décidait sur le nombre de LIGNES registre (doublons de SIREN, sièges hors de la
ville comptés), alors que l'écran n'en montre que ce que la qualification n'exclut pas. 12 lignes brutes pour
9 comptes affichables ne déclenchaient rien. Le seuil se lit désormais sur les comptes AFFICHABLES."""

from __future__ import annotations

from fastapi.testclient import TestClient

from tests.test_4429_zone_tiers import _post, _row, stub  # noqa: F401


def test_neuf_comptes_affichables_sur_douze_lignes_elargissent(client: TestClient, stub) -> None:  # noqa: F811
    good = [_row(i) for i in range(9)]
    duplicates = [_row(100 + i, city="PARIS", department="75") for i in range(3)]  # sièges hors de la ville
    around = [_row(50 + i, city="BLAGNAC", latitude=43.637, longitude=1.39) for i in range(5)]
    stub({"city": good + duplicates, "radius_50": good + duplicates + around})

    body = _post(client, {"city": "Toulouse"})

    assert body["zoneWidening"]["tier"] == "radius_50"  # lot S : 50 km suffit avant 100 km
    assert body["zoneWidening"]["exactCount"] == 9
    sirens = [c["siren"] for c in body["candidates"]]
    assert sirens[:9] == [r["siren"] for r in good], "les exacts restent en tête"
    assert len(sirens) == len(set(sirens))


def test_vingt_cinq_comptes_affichables_n_elargissent_pas(client: TestClient, stub) -> None:  # noqa: F811
    good = [_row(i) for i in range(25)]
    stub({"city": good + [_row(0)], "radius_50": [_row(i) for i in range(60)]})

    # #4673.1 — cible = max(25, limit) (Louis 31/10) : à limit 25, la cible est 25.
    body = _post(client, {"city": "Toulouse"}, limit=25)

    assert not body.get("zoneWidening")
