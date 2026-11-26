"""LE FUSEAU DE LA PERSONNE — décision de Louis du 14/09/2026.

« Ajouter un fuseau par utilisateur », contre la recommandation de garder Paris
pour tout le monde.

LE DÉFAUT RÉPARÉ. ``prompts/current_time.py`` fixait ``Europe/Paris`` en dur, et
son unique appelant de production (``routers/chat.py``) ajoute ce bloc en queue
du prompt système à CHAQUE tour de ``/chat``. Or c'est le MODÈLE qui résout
« demain » contre la date de ce bloc (``schedule_reminder_for_contact`` le lui
ORDONNE, et ``_normalise_iso_utc`` refuse tout ce qui n'est pas absolu). Un
utilisateur à Montréal ou à Singapour obtenait donc un rappel calculé sur le
jour calendaire de PARIS — jusqu'à un jour entier d'écart autour de minuit.

LES TROIS PREUVES DE CETTE GARDE :
 · elle sait dire NON — retirer le paramètre de ``current_time_block``, ou le
   ``timezone=req.timezone`` du routeur, la fait rougir ;
 · elle LIT quelque chose — le bloc réellement rendu par le code de production
   et le prompt système réellement assemblé par le vrai routeur, dont on vérifie
   qu'ils ne sont pas vides ;
 · elle n'attrape pas le cas voisin — le TÉMOIN : sans fuseau (ou avec un fuseau
   illisible), le bloc annonce le fuseau de RÉFÉRENCE, à l'identique d'avant.

⚠️ Aucun nom de mois ni de jour venu de la locale, et aucun instant lu dans
l'horloge pour une assertion de DATE : les deux tables de ``current_time.py``
sont explicites, et un test qui dépend de ``LC_TIME`` est vert en local et rouge
en CI.
"""

from __future__ import annotations

import json
import zoneinfo
from datetime import UTC, datetime
from unittest.mock import patch
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import pytest
from fastapi.testclient import TestClient

from app.models.chat import ChatRequest
from app.prompts.current_time import (
    CURRENT_TIME_ISO_MARKER,
    REFERENCE_TIMEZONE,
    current_time_block,
    now_in_reference_timezone,
    resolve_applicable_timezone,
)


def _iso_of(block: str) -> datetime:
    """L'instant que le bloc ANNONCE, relu par le marqueur de production."""
    assert CURRENT_TIME_ISO_MARKER in block, block
    raw = block.split(CURRENT_TIME_ISO_MARKER, 1)[1].split(")", 1)[0].strip()
    return datetime.fromisoformat(raw)


# ── Le paquet `tzdata`, SEUL — sans base système ────────────────────────────


def test_zoneinfo_resolves_from_the_tzdata_package_alone() -> None:
    """LE CLIQUET DE LA CAUSE #1 — image `slim` (CI ET PROD), pas de base système.

    `zoneinfo` (stdlib) lit la base système (`/usr/share/zoneinfo`) OU le
    paquet pip `tzdata` — dans cet ordre, `TZPATH` d'abord. Le poste macOS de
    l'écrivain original avait la base système ; ni le runner CI, ni l'image
    `python:3.12-slim` de `apps/ia/docker/Dockerfile` (donc la PROD) ne
    l'ont. `zoneinfo.reset_tzpath(to=())` vide `TZPATH` pour reproduire
    exactement cette absence, sans rien désinstaller : ce qui reste debout
    ensuite ne peut venir QUE du paquet.

    · elle sait dire NON — retirer `tzdata` de `requirements.txt` fait
      rougir CE test (vérifié à la main : `ZoneInfoNotFoundError` sans lui,
      voir `git log` sur ce fichier) ;
    · elle LIT quelque chose — un vrai décalage horaire, pas une chaîne vide ;
    · le témoin : une clé qui n'existe nulle part reste une vraie erreur,
      ``reset_tzpath`` n'ouvre pas la porte à n'importe quoi.
    """
    original_tzpath = zoneinfo.TZPATH
    zoneinfo.reset_tzpath(to=())
    try:
        assert zoneinfo.TZPATH == (), "la base système reste dans TZPATH, le témoin ne prouve rien"
        resolved = ZoneInfo("Europe/Paris")
        assert resolved.key == "Europe/Paris"
        offset = datetime.now(resolved).utcoffset()
        assert offset is not None and offset.total_seconds() in (1 * 3600, 2 * 3600), offset
        # Témoin : une clé absente reste une vraie erreur, système ou pas.
        with pytest.raises(ZoneInfoNotFoundError):
            ZoneInfo("Europe/Parisss")
    finally:
        zoneinfo.reset_tzpath(to=original_tzpath)


# ── L'enjeu : un jour calendaire entier ─────────────────────────────────────


def test_le_meme_instant_peut_etre_deux_jours_differents() -> None:
    """LE DÉFAUT, rendu visible sur le vrai composeur de bloc.

    2026-09-15 02:30 UTC, c'est 04 h 30 le mardi 15 à Paris et 22 h 30 le LUNDI
    14 à Montréal. C'est ce jour d'écart que « relance-la demain » héritait.
    """
    instant = datetime(2026, 9, 15, 2, 30, tzinfo=UTC)
    paris = current_time_block(now=instant.astimezone(ZoneInfo("Europe/Paris")))
    montreal = current_time_block(now=instant.astimezone(ZoneInfo("America/Montreal")))

    assert "mardi 15 septembre 2026" in paris
    assert "lundi 14 septembre 2026" in montreal
    # Preuve de lecture : les deux blocs sont de vrais blocs, pas des chaînes vides.
    assert CURRENT_TIME_ISO_MARKER in paris and CURRENT_TIME_ISO_MARKER in montreal
    assert "DATE ET HEURE COURANTES" in montreal


# ── #1958.14/.15 — la langue de l'interface décide de la FORME, pas du fuseau ──


def test_the_block_defaults_to_french_byte_identical_without_a_language() -> None:
    """La garde qui sait dire NON : un appelant qui ne connaît pas le nouveau
    paramètre `language` obtient EXACTEMENT le bloc français d'avant ce test."""
    instant = datetime(2026, 9, 15, 9, 30, tzinfo=ZoneInfo("Europe/Paris"))
    assert current_time_block(now=instant) == current_time_block(now=instant, language="fr")
    assert "mardi 15 septembre 2026" in current_time_block(now=instant)
    assert "9 h 30" in current_time_block(now=instant)


def test_english_interface_gets_the_block_in_english() -> None:
    """Une interface anglaise ne doit pas lire un bloc français : le jour, le
    mois et l'heure suivent la convention anglaise (jour/mois en toutes lettres,
    heure 12h avec AM/PM — jamais `LC_TIME`, la table est écrite en dur comme
    pour le français)."""
    instant = datetime(2026, 9, 15, 9, 30, tzinfo=ZoneInfo("Europe/Paris"))
    block = current_time_block(now=instant, language="en")
    assert "Tuesday 15 September 2026" in block
    assert "9:30 AM" in block
    assert "CURRENT DATE AND TIME" in block
    assert "DATE ET HEURE COURANTES" not in block
    # Preuve de lecture : le marqueur ISO (langage-invariant) reste présent.
    assert CURRENT_TIME_ISO_MARKER in block


def test_english_midnight_and_noon_are_not_zero_am_or_zero_pm() -> None:
    midnight = current_time_block(now=datetime(2026, 9, 15, 0, 0, tzinfo=ZoneInfo("Europe/Paris")), language="en")
    noon = current_time_block(now=datetime(2026, 9, 15, 12, 0, tzinfo=ZoneInfo("Europe/Paris")), language="en")
    assert "12:00 AM" in midnight
    assert "12:00 PM" in noon


def test_an_unknown_language_falls_back_to_french_never_raises() -> None:
    instant = datetime(2026, 9, 15, 9, 30, tzinfo=ZoneInfo("Europe/Paris"))
    for garbage in ("de", "xx", "", "EN", "English", None):
        block = current_time_block(now=instant, language=garbage)  # type: ignore[arg-type]
        assert "mardi 15 septembre 2026" in block


# ── Le fuseau reçu décide, et l'inconnu retombe sur le défaut NOMMÉ ─────────


def test_now_in_reference_timezone_suit_le_fuseau_recu() -> None:
    for name in ("America/Montreal", "Asia/Singapore", "Pacific/Auckland"):
        assert now_in_reference_timezone(name).utcoffset() == datetime.now(ZoneInfo(name)).utcoffset()
    # Montréal et Paris ne partagent JAMAIS le même décalage : sans le
    # paramètre, cette assertion tombe.
    assert now_in_reference_timezone("America/Montreal").utcoffset() != now_in_reference_timezone(None).utcoffset()


def test_TEMOIN_sans_fuseau_ou_avec_un_fuseau_illisible_le_defaut_nomme_sappl() -> None:
    """Un fuseau absent ne vaut ni UTC ni une devinette : il vaut le défaut."""
    expected = datetime.now(ZoneInfo(REFERENCE_TIMEZONE)).utcoffset()
    for unknown in (None, "", "   ", "Europe/Parisss", "GMT+2h", "../../etc/passwd", "/etc/localtime"):
        assert now_in_reference_timezone(unknown).utcoffset() == expected, unknown
    # Et le bloc rendu SANS argument est celui d'avant ce lot, au fuseau près.
    assert _iso_of(current_time_block()).utcoffset() == expected
    assert REFERENCE_TIMEZONE == "Europe/Paris"


# ── Le câble : le corps de la requête atteint le prompt ─────────────────────


def test_le_modele_de_requete_DECLARE_le_fuseau() -> None:
    """⚠️ pydantic ignore une clé inconnue SANS ERREUR.

    Un ``timezone`` non déclaré serait envoyé par l'API, transporté, et jamais
    lu — le défaut « un champ ajouté au prompt, effacé en aval ». Ce test est le
    seul endroit qui le rend impossible.
    """
    assert ChatRequest(message="x", user_id="u1", timezone="Asia/Singapore").timezone == "Asia/Singapore"
    # Absent = inconnu, jamais UTC : le défaut du modèle est la chaîne vide.
    assert ChatRequest(message="x", user_id="u1").timezone == ""


def _system_for(client: TestClient, body: dict) -> str:
    """Le prompt système que le VRAI routeur assemble pour ce corps."""
    captured: dict = {}

    async def _fake_run(system, _user, **_kwargs):
        captured["system"] = system
        return ("Réponse.", [])

    with patch("app.services.chat_orchestrator.run_chat_with_tools", side_effect=_fake_run):
        res = client.post("/chat/message", json={"message": "Relance-la demain à 9 h", "user_id": "u1", **body})
    events = [json.loads(b[len("data:") :]) for b in res.text.strip().split("\n\n") if b.startswith("data:")]
    assert events and events[-1]["success"] is True, res.text[-400:]
    system = captured["system"]
    text = "".join(b["text"] for b in system) if isinstance(system, list) else str(system or "")
    assert len(text) > 500, "le prompt système capturé est vide — le test ne lit rien"
    return text


def test_le_fuseau_recu_atteint_le_bloc_de_date_du_prompt(client: TestClient) -> None:
    system = _system_for(client, {"timezone": "Asia/Singapore"})
    assert _iso_of(system).utcoffset() == datetime.now(ZoneInfo("Asia/Singapore")).utcoffset()


def test_TEMOIN_un_tour_sans_fuseau_porte_le_fuseau_de_reference(client: TestClient) -> None:
    paris = datetime.now(ZoneInfo(REFERENCE_TIMEZONE)).utcoffset()
    assert _iso_of(_system_for(client, {})).utcoffset() == paris
    assert _iso_of(_system_for(client, {"timezone": ""})).utcoffset() == paris


def test_the_interface_language_reaches_the_date_block(client: TestClient) -> None:
    """#1958.14/.15 par le VRAI routeur : une interface anglaise ne doit pas
    laisser passer le bloc « DATE ET HEURE COURANTES » en français."""
    system_en = _system_for(client, {"interface_language": "en"})
    assert "CURRENT DATE AND TIME" in system_en
    assert "DATE ET HEURE COURANTES" not in system_en
    # Témoin : sans le réglage (ancien appelant), le bloc reste français.
    system_default = _system_for(client, {})
    assert "DATE ET HEURE COURANTES" in system_default


# ── #1958.15 — le format de DURÉE suit la langue de l'interface ────────────


def test_the_french_block_gives_a_duration_wording_rule() -> None:
    """Le français a maintenant une consigne dédiée à la DURÉE (« dans 3
    jours »), distincte de la consigne de résolution en date ABSOLUE (ISO)."""
    block = current_time_block()
    assert "DURÉE" in block
    assert "dans 3 jours" in block
    assert "DURATION" not in block


def test_the_english_block_gives_its_own_duration_wording_rule() -> None:
    block = current_time_block(language="en")
    assert "DURATION" in block
    assert "in 3 days" in block
    assert "DURÉE" not in block


# #1958.18 — mesuré 17/09 : « 03/04 » écrit par la personne se lit jour/mois en
# France, mois/jour dans un usage anglo-saxon — et rien dans le bloc ne disait
# au modèle de ne JAMAIS trancher ce sens en silence. Une interface française
# ne garantit pas que la personne écrit en convention française (elle peut
# coller une date reçue d'un client anglophone), donc la consigne doit exister
# dans les DEUX langues du bloc.
def test_the_french_block_warns_against_silently_picking_an_ambiguous_numeric_date() -> None:
    block = current_time_block()
    assert "03/04" in block
    assert "AMBIGU" in block.upper()


def test_the_english_block_warns_against_silently_picking_an_ambiguous_numeric_date() -> None:
    block = current_time_block(language="en")
    assert "03/04" in block
    assert "AMBIGUOUS" in block.upper()


# ── #1958.2 / #1958.3 — L'ESCALIER UNIQUE : personne → rendez-vous → espace → défaut ──


def test_resolve_applicable_timezone_la_personne_gagne_sur_tout_le_reste() -> None:
    assert (
        resolve_applicable_timezone(
            person_timezone="Europe/Paris",
            contact_timezone="America/New_York",
            workspace_timezone="Asia/Singapore",
        )
        == "Europe/Paris"
    )


def test_resolve_applicable_timezone_a_defaut_de_personne_le_rendez_vous_gagne() -> None:
    """#1958.3 — le fuseau du CONTACT visé par CETTE action, à défaut de
    réglage personnel : mieux vaut le sien que celui, plus générique, de
    l'espace."""
    assert (
        resolve_applicable_timezone(
            person_timezone=None,
            contact_timezone="America/New_York",
            workspace_timezone="Asia/Singapore",
        )
        == "America/New_York"
    )


def test_resolve_applicable_timezone_a_defaut_des_deux_lespace_gagne() -> None:
    """#1958.2 — le fuseau de l'ESPACE, jusqu'ici totalement absent du produit."""
    assert (
        resolve_applicable_timezone(person_timezone=None, contact_timezone=None, workspace_timezone="Asia/Singapore")
        == "Asia/Singapore"
    )


def test_TEMOIN_rien_de_regle_nulle_part_rend_none_jamais_une_devinette() -> None:
    """Le témoin : `None`, chaîne vide et blancs ne comptent PAS comme un
    réglage — sinon un espace qui n'a rien réglé gagnerait par accident de
    chaîne vide sur un candidat plus bas dans l'escalier."""
    assert resolve_applicable_timezone() is None
    for blank in (None, "", "   "):
        assert (
            resolve_applicable_timezone(person_timezone=blank, contact_timezone=blank, workspace_timezone=blank)
            is None
        )
    # Et ce `None` retombe bien sur le défaut NOMMÉ, jamais UTC ni une devinette.
    expected = datetime.now(ZoneInfo(REFERENCE_TIMEZONE)).utcoffset()
    assert now_in_reference_timezone(resolve_applicable_timezone()).utcoffset() == expected


# ── Le câble : le fuseau de l'ESPACE atteint le bloc de date du prompt ──────


def test_le_fuseau_de_lespace_atteint_le_bloc_quand_la_personne_na_rien_regle(client: TestClient) -> None:
    """#1958.2 par le VRAI routeur : sans fuseau personnel, celui de l'espace
    doit décider — jusqu'ici il n'existait tout simplement pas."""
    system = _system_for(client, {"workspace_timezone": "Asia/Singapore"})
    assert _iso_of(system).utcoffset() == datetime.now(ZoneInfo("Asia/Singapore")).utcoffset()


def test_TEMOIN_le_fuseau_personnel_gagne_sur_celui_de_lespace(client: TestClient) -> None:
    system = _system_for(client, {"timezone": "America/Montreal", "workspace_timezone": "Asia/Singapore"})
    assert _iso_of(system).utcoffset() == datetime.now(ZoneInfo("America/Montreal")).utcoffset()


def test_le_modele_de_requete_DECLARE_le_fuseau_de_lespace() -> None:
    """Même garde que `test_le_modele_de_requete_DECLARE_le_fuseau` pour la
    personne : pydantic ignore une clé inconnue SANS ERREUR, et un champ non
    déclaré serait envoyé, payé et jamais lu."""
    assert ChatRequest(message="x", user_id="u1", workspace_timezone="Asia/Singapore").workspace_timezone == (
        "Asia/Singapore"
    )
    assert ChatRequest(message="x", user_id="u1").workspace_timezone == ""
