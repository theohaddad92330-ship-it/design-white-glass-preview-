"""Lot Q point 1 (#4746.2, #4814) — `/discover/registry` porte les champs d'acteur de `/discover/signals`.

Rejoue la liste vue en recette prod le 01/11 : ESN et intérim doivent sortir en « Autres acteurs »
(`actorKind` posé), les grands comptes restent des clients (`actorKind` absent). Aucun nom en dur : c'est
le NAF et la règle partagée (`actor_fields`) qui décident."""

import pytest

from app.services.actor_typology import actor_fields

# Les NAF qui PROUVENT : 62.02A (ESN), 78.20Z (intérim). 70.22Z / 71.12B sont partagés avec le conseil et
# l'ingénierie : sans nom au référentiel, « non établi n'est jamais ESN » (GA-18/19) — voir le test dédié.
PROVING_NAF = ("62.02A", "78.20Z")


@pytest.mark.parametrize(
    "name",
    ["EXTIA", "DAVIDSON", "INFOTEL", "DAVRICOURT", "RANDSTAD INHOUSE", "RANDSTAD DIGITAL"],
)
@pytest.mark.parametrize("naf", PROVING_NAF)
def test_esn_et_interim_vont_dans_autres_acteurs(name, naf):
    fields = actor_fields(naf=naf, name=name)
    assert fields["actorKind"] is not None, (name, naf)


@pytest.mark.parametrize("naf", ["70.22Z", "71.12B"])
def test_naf_partage_sans_nom_au_referentiel_n_est_pas_devine_esn(naf):
    # Doctrine : jamais d'ESN deviné. Le NAF ambigu seul reste « Comptes », la ligne dit son doute.
    assert actor_fields(naf=naf, name="SOCIETE ANONYME DU NORD")["actorKind"] is None


@pytest.mark.parametrize("naf", ["70.22Z", "71.12B"])
def test_naf_partage_avec_nom_au_referentiel_est_esn(naf):
    # Décision Louis 02/11 : référentiel élargi — EXTIA (71.12B/70.22Z) n'est plus classée client final.
    assert actor_fields(naf=naf, name="EXTIA")["actorKind"] == "esn"


@pytest.mark.parametrize("naf", ["78.20Z", "78.10Z", "78.30Z"])
def test_naf_interim_et_placement_sont_des_intermediaires_sans_nom(naf):
    fields = actor_fields(naf=naf, name="SOCIETE ANONYME DU NORD")
    assert fields["isIntermediary"] is True
    assert fields["actorKind"] in {"interim", "recruiter"}


@pytest.mark.parametrize("name,naf", [("ENEDIS", "35.13Z"), ("THALES", "30.30Z"), ("DECATHLON FRANCE", "47.64Z")])
def test_les_clients_finaux_restent_dans_comptes(name, naf):
    fields = actor_fields(naf=naf, name=name)
    assert fields["actorKind"] is None
    assert fields["isIntermediary"] is False
    assert fields["isEsnPeer"] is False


def test_le_nom_n_est_pas_ignore_quand_le_naf_est_resolu():
    # RANDSTAD INHOUSE avec un NAF ESN résolu : la marque d'intérim connue l'emporte (RANDSTAD DIGITAL le faisait déjà).
    assert actor_fields(naf="62.02A", name="RANDSTAD INHOUSE")["isIntermediary"] is True


def test_une_valeur_absente_ne_devient_pas_un_acteur():
    fields = actor_fields(naf=None, name=None)
    assert fields["actorKind"] is None and fields["isIntermediary"] is False


@pytest.mark.asyncio
async def test_la_reponse_registry_porte_les_champs_d_acteur(monkeypatch: pytest.MonkeyPatch) -> None:
    from tests._q_harness import company, rank

    rows = [
        company("111111118", "EXTIA VIVERIS", "62.02A"),
        company("222222226", "RANDSTAD INHOUSE", "78.20Z"),
        company("333333334", "ENEDIS", "35.13Z"),
    ]
    response = await rank(monkeypatch, rows)
    by_name = {c["name"]: c for c in response.candidates}
    assert by_name["EXTIA VIVERIS"]["actorKind"] == "esn"
    assert by_name["RANDSTAD INHOUSE"]["actorKind"] == "interim"
    assert by_name["RANDSTAD INHOUSE"]["isIntermediary"] is True
    assert by_name["ENEDIS"]["actorKind"] is None


@pytest.mark.asyncio
async def test_sans_naf_ou_sans_siren_en_bas_sur_toute_la_liste(monkeypatch: pytest.MonkeyPatch) -> None:
    from tests._q_harness import company, rank

    rows = [
        company("111111118", "CHANEL", None, headcountRange="5000 à 9999 salariés", headcountTranche="52"),
        company("222222226", "DECATHLON FRANCE", None, headcountRange="5000 à 9999 salariés", headcountTranche="52"),
        company("", "ORANGE", "61.10Z", headcountRange="5000 à 9999 salariés", headcountTranche="52"),
        company("444444442", "PETITE ENTREPRISE", "62.01Z", headcountRange="10 à 19 salariés", headcountTranche="11"),
        company("555555550", "AUTRE PME", "62.01Z", headcountRange="20 à 49 salariés", headcountTranche="12"),
    ]
    names = [c["name"] for c in (await rank(monkeypatch, rows)).candidates]
    assert set(names[:2]) == {"PETITE ENTREPRISE", "AUTRE PME"}
    assert set(names[2:]) == {"CHANEL", "DECATHLON FRANCE", "ORANGE"}  # présents, jamais retirés
