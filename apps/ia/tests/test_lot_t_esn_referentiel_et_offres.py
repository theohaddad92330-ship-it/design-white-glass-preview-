"""Lot T point 1 — le TABLEAU de la recette prod du 01/11 : dix ESN que le NAF du registre ne dit pas.

Elles doivent sortir de « Comptes » (``actorKind == "esn"``) par le référentiel OU par leurs offres ; ENEDIS, THALES,
DECATHLON, ORANGE, EXOTEC restent client final ; une 71.12B sans référentiel ni signal d'offre reste client final."""

from __future__ import annotations

import pytest

from app.services.actor_typology import actor_fields
from app.services.esn_recognition import ESN_OFFER_MIN_MATCHES, count_esn_offers, offer_says_esn

#: (nom, siren, NAF registre) — copiés de la réponse JSON réelle capturée en prod.
PROD_TABLE = [
    ("EXTIA", "499379923", "71.12B"),
    ("GROUPE LR TECHNOLOGIES", "908409972", "71.12B"),
    ("DAVEO (MAGELLAN)", "502628720", "71.12B"),
    ("MAGELLAN", "493081236", "68.20B"),
    ("DAVIDSON CONSULTING", "483898672", "71.12B"),
    ("SOCIETE GESER BEST", "383934742", "71.12B"),
    ("DAVRICOURT", "538491622", "71.12B"),
    ("VIVERIS", "340007772", "64.20Z"),
    ("ICSIS", "797696846", "70.10Z"),
    ("INFOTEL (SAPHELEC)", "322084195", "61.90Z"),
]
OFFERS = [
    {"title": "Développeur Java H/F", "description": "Vous interviendrez chez nos clients grands comptes."},
    {"title": "Ingénieur Java", "description": "Missions chez nos clients, intercontrat accompagné."},
]


@pytest.mark.parametrize(("name", "siren", "naf"), PROD_TABLE)
def test_les_dix_du_tableau_sont_dans_autres_acteurs_par_le_referentiel(name: str, siren: str, naf: str) -> None:
    fields = actor_fields(naf=naf, name=name, siren=siren)
    assert fields["actorKind"] == "esn"
    assert fields["isEsnPeer"] is True
    assert fields["esnRecognition"] == "referential"


@pytest.mark.parametrize(("name", "siren", "naf"), PROD_TABLE)
def test_le_referentiel_ne_reconnait_pas_sans_siren_connu(name: str, siren: str, naf: str) -> None:
    """Le NON : un autre SIREN, même NAF, même nom d'emprunt ⇒ pas reconnue par le référentiel."""
    fields = actor_fields(naf=naf, name="ZORGLUB INDUSTRIE", siren="123456782")
    assert fields["actorKind"] is None
    assert fields["esnRecognition"] is None


def test_les_offres_font_une_esn_sur_un_naf_ambigu() -> None:
    assert count_esn_offers(OFFERS) == 2 >= ESN_OFFER_MIN_MATCHES
    fields = actor_fields(naf="71.12B", name="ACME INGENIERIE", siren="123456782", esn_offer_count=2)
    assert fields["actorKind"] == "esn"
    assert fields["esnRecognition"] == "offers"


def test_une_seule_offre_ne_suffit_pas() -> None:
    fields = actor_fields(naf="71.12B", name="ACME INGENIERIE", siren="123456782", esn_offer_count=1)
    assert fields["actorKind"] is None
    assert fields["actorType"] == "client final"


def test_71_12b_sans_referentiel_ni_offre_reste_client_final() -> None:
    fields = actor_fields(naf="71.12B", name="BUREAU D ETUDES DUPONT", siren="123456782")
    assert fields["actorType"] == "client final"
    assert fields["actorKind"] is None
    assert fields["esnRecognition"] is None


@pytest.mark.parametrize("name", ["ENEDIS", "THALES", "DECATHLON", "ORANGE", "EXOTEC"])
def test_les_clients_finaux_restent_client_final(name: str) -> None:
    # Même avec des offres « chez nos clients » : leur NAF (énergie, défense, commerce…) n'est pas ambigu.
    fields = actor_fields(naf="35.13Z", name=name, siren="552081317", esn_offer_count=5)
    assert fields["actorKind"] is None
    assert fields["esnRecognition"] is None


def test_une_offre_qui_parle_de_ses_clients_sans_formule_esn_ne_compte_pas() -> None:
    assert not offer_says_esn("Chargé de clientèle", "Vous fidélisez nos clients en magasin.")
    assert offer_says_esn("Consultant Java", "Mission chez un client en région.")
    assert offer_says_esn("Ingénieur", "Rejoignez notre ESN")


def test_un_intermediaire_deja_prouve_nest_pas_reecrit_en_esn() -> None:
    fields = actor_fields(naf="78.10Z", name="UN CABINET", siren="123456782", esn_offer_count=5)
    assert fields["actorKind"] == "recruiter"


# ── Bout en bout du chemin /discover/registry : l'offre lue → le signal → les champs d'acteur de la carte ─────────
import asyncio  # noqa: E402
import time  # noqa: E402

from app.routers import discover as discover_router  # noqa: E402


def _offer_row(title: str, description: str, day: str) -> dict:
    return {"title": title, "description": description, "date": day, "contractType": "CDI", "location": "Lille"}


def _card(naf: str, name: str = "ACME INGENIERIE", siren: str = "123456782") -> dict:
    return {"name": name, "siren": siren, "nafCode": naf, **actor_fields(naf=naf, name=name, siren=siren)}


async def _finish(card: dict, rows: list[dict]) -> None:
    signals = [s for r in rows if (s := discover_router._hiring_signal(r))]
    loop = asyncio.get_running_loop()
    done: asyncio.Future = loop.create_future()
    done.set_result((signals, [], None))
    await discover_router._finish_signal_tasks(
        {done: card}, [], time.monotonic() + 10, profile_data={}, filters={}, keywords=None
    )


def test_registry_deux_offres_qui_le_disent_font_passer_la_carte_dans_autres_acteurs() -> None:
    card = _card("71.12B")
    assert card["actorKind"] is None  # avant les offres : client final
    rows = [
        _offer_row("Développeur Java", "Vous interviendrez chez nos clients.", "2026-10-20"),
        _offer_row("Ingénieur Java", "Mission chez un client, intercontrat suivi.", "2026-10-21"),
    ]
    asyncio.run(_finish(card, rows))
    assert card["actorKind"] == "esn"
    assert card["esnRecognition"] == "offers"
    assert all("_esnOffer" not in s for s in card["signals"])  # le drapeau interne ne sort jamais


def test_registry_une_seule_offre_ou_un_naf_non_ambigu_ne_change_rien() -> None:
    one = _card("71.12B")
    asyncio.run(_finish(one, [_offer_row("Dev", "chez nos clients", "2026-10-20")]))
    assert one["actorKind"] is None
    energy = _card("35.13Z", name="ENEDIS", siren="444608442")
    both = [_offer_row("Dev", "chez nos clients", "2026-10-20"), _offer_row("Dev 2", "chez nos clients", "2026-10-21")]
    asyncio.run(_finish(energy, both))
    assert energy["actorKind"] is None
