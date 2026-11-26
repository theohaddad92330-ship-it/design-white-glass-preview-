"""SIMON-FIX S.14 (recette 20/10) — « Infirmier » ne sort jamais pour une ESN IT, quelle que soit la source."""

import pytest

from app.services.domain_job_filters import offer_relevant_to_profile

_IT_ESN = {"offerDomain": "esn_it", "inferredPlacedRoles": [{"role": "Dev", "terms": ["developpeur"]}]}
_PLACEUR = {"offerDomain": "esn_it", "recruitsForClients": True}


def _it(_offer: dict) -> bool:
    return True  # le tri IT de la source dirait oui : seul le métier non placé doit sortir


@pytest.mark.parametrize("profile", [_IT_ESN], ids=["esn_it"])
@pytest.mark.parametrize("title", ["Infirmier H/F", "Kinésithérapeute", "Agent de tri H/F"])
def test_une_offre_de_sante_ou_de_tri_est_ecartee_a_la_source(profile, title):
    assert offer_relevant_to_profile({"intitule": title}, profile, it_check=_it) is False
    assert offer_relevant_to_profile({"title": title}, profile, it_check=_it) is False


def test_un_code_rome_de_sante_est_ecarte_meme_sous_un_intitule_neutre():
    offer = {"intitule": "Titulaire du diplôme H/F", "romeCode": "J1506"}
    assert offer_relevant_to_profile(offer, _IT_ESN, it_check=_it) is False


def test_un_developpeur_reste_et_sans_profil_on_ne_filtre_pas():
    assert offer_relevant_to_profile({"intitule": "Développeur Java"}, _PLACEUR, it_check=_it) is True
    assert offer_relevant_to_profile({"intitule": "Infirmier"}, None, it_check=_it) is True
    assert offer_relevant_to_profile({"intitule": "Infirmier"}, _PLACEUR, it_check=_it) is True  # placement : tout reste


def test_la_date_affichee_est_la_publication_pas_l_actualisation(monkeypatch):
    import asyncio
    from datetime import UTC, datetime, timedelta

    from app.services.data_sources import france_travail as ft

    published = (datetime.now(UTC) - timedelta(days=9)).strftime("%Y-%m-%dT%H:%M:%SZ")
    refreshed = datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")
    offer = {
        "intitule": "Développeur Java",
        "entreprise": {"nom": "ACME"},
        "dateCreation": published,
        "dateActualisation": refreshed,
        "lieuTravail": {"libelle": "31 - Toulouse", "codePostal": "31000"},
    }
    monkeypatch.setattr(ft, "_creds", lambda: ("id", "secret"))

    async def _tok(*_a, **_k):
        return "tok"

    monkeypatch.setattr(ft, "_token", _tok)

    class _Resp:
        status_code = 200
        content = b"x"

        def raise_for_status(self):
            return None

        def json(self):
            return {"resultats": [offer]}

    class _Http:
        async def get(self, *_a, **_k):
            return _Resp()

    rows = asyncio.run(ft.list_hiring_companies("31", None, 30, 10, client=_Http(), profile=_PLACEUR))
    assert rows and rows[0]["signal"]["date"] == published[:10]


def test_sans_date_de_publication_pas_de_date_inventee_depuis_l_actualisation(monkeypatch):
    import asyncio
    from datetime import UTC, datetime

    from app.services.data_sources import france_travail as ft

    offer = {
        "intitule": "Développeur Java",
        "entreprise": {"nom": "ACME"},
        "dateActualisation": datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }
    monkeypatch.setattr(ft, "_creds", lambda: ("id", "secret"))

    async def _tok(*_a, **_k):
        return "tok"

    monkeypatch.setattr(ft, "_token", _tok)

    class _Resp:
        status_code = 200
        content = b"x"

        def raise_for_status(self):
            return None

        def json(self):
            return {"resultats": [offer]}

    class _Http:
        async def get(self, *_a, **_k):
            return _Resp()

    assert asyncio.run(ft.list_hiring_companies("31", None, 30, 10, client=_Http(), profile=_PLACEUR)) == []
