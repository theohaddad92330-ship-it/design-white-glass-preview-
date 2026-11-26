"""#4563.1 — la demande d'offres rend les OFFRES, jamais une justification.

Mesuré en prod le 27/10 : « trouve-moi des offres Java sur Lille » → la bonne branche s'active, l'outil
``search_job_offers`` LIT des offres, mais la réponse tenait en une phrase — « Les offres Java déjà trouvées à Lille
sont suffisamment nombreuses pour ne pas élargir la recherche » — 0 intitulé, 0 date. La carte « une ligne par offre »
n'était qu'une consigne au modèle : aucun appelant ne la posait. Ces tests tiennent le chemin de la lecture au
message affiché, et surtout le REFUS : la phrase de justification ne sort jamais, offre listée ou non.
"""

from __future__ import annotations

import json

import pytest

from app.services import record_listing
from app.services.reply_blocks import split_reply_blocks
from tests.test_laura_offres_4563 import World, _metier, _search, world  # noqa: F401 — la fixture `world` est partagée

JUSTIFICATION = "Les offres Java déjà trouvées à Lille sont suffisamment nombreuses pour ne pas élargir la recherche."


def _cards(reply: str) -> list[dict]:
    return [s.block for s in split_reply_blocks(reply) if s.kind == "block" and s.block]


@pytest.mark.asyncio
async def test_la_demande_d_offres_rend_intitule_date_lien_meme_si_le_modele_se_justifie(world: World) -> None:
    world.ft["Java"] = [_metier(n, "Java") for n in range(1, 7)]
    record_listing.begin_turn_listing()

    out = await _search(skills=["Java"], city="Lille")
    assert len(out["offers"]) >= 5
    reply = record_listing.graft_listing_cards(JUSTIFICATION)

    assert "suffisamment nombreuses" not in reply and "ne pas élargir" not in reply
    cards = [c for c in _cards(reply) if c["type"] == "file_export"]
    assert len(cards) == 1
    card = cards[0]
    assert card["columns"][:4] == ["Intitulé", "Employeur", "Date", "Lieu"]
    assert len(card["rows"]) == len(out["offers"])
    flat = json.dumps(card, ensure_ascii=False)
    for offer in out["offers"]:
        assert offer["title"] in flat and offer["date"] in flat and offer["url"] in flat


@pytest.mark.asyncio
async def test_zero_offre_elle_le_dit_et_nomme_ou_elle_a_cherche(world: World) -> None:
    record_listing.begin_turn_listing()

    out = await _search(skills=["Java"], city="Lille")
    assert out["offers"] == []
    reply = record_listing.graft_listing_cards(JUSTIFICATION)

    assert "suffisamment nombreuses" not in reply
    said = reply.lower()
    assert "aucune offre" in said and "lille" in said and "java" in said
    assert "termes voisins" in said and "région" in said
    assert not _cards(reply)  # une absence ne fait aucune ligne, jamais une carte vide


@pytest.mark.asyncio
async def test_la_phrase_ne_sort_jamais_sans_offre_listee() -> None:
    """LE REFUS : aucune recherche ce tour, aucune carte — la justification ne passe pas, un autre propos si."""
    record_listing.begin_turn_listing()
    reply = record_listing.graft_listing_cards(f"Bonjour Louis. {JUSTIFICATION} Je reste disponible.")

    assert "suffisamment nombreuses" not in reply and "élargir" not in reply
    assert "Bonjour Louis." in reply and "Je reste disponible." in reply


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "phrase",
    [
        "Les offres trouvées sont assez nombreuses, inutile d'élargir.",
        "J'ai déjà assez d'offres Java à Lille, je n'élargis pas.",
        "Il y a suffisamment d'offres à Lille pour ne pas élargir la zone.",
    ],
)
async def test_les_variantes_de_la_justification_sont_refusees_aussi(phrase: str) -> None:
    record_listing.begin_turn_listing()
    reply = record_listing.graft_listing_cards(phrase)
    assert "élarg" not in reply.lower() and "assez" not in reply.lower() and "suffisamment" not in reply.lower()


@pytest.mark.asyncio
async def test_un_propos_sur_les_offres_qui_ne_justifie_rien_reste() -> None:
    """La garde ne attrape que ce qu'elle vise."""
    record_listing.begin_turn_listing()
    text = "Voici les offres Java de Lille, la plus récente date de lundi."
    assert record_listing.graft_listing_cards(text) == text
