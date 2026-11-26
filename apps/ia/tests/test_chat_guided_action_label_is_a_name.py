"""Le libellé d'un renvoi est un NOM d'écran, jamais une phrase avec son verbe.

─────────────────────────────────────────────────────────────────────────────
MESURÉ EN PRODUCTION LE 11/09/2026
─────────────────────────────────────────────────────────────────────────────
Sur /chat, la carte d'action affichait, en toutes lettres :

    ACTION À VALIDER
    Ouvrir Ouvrir l'import
    …
    Écran        Ouvrir l'import

Deux fois le verbe, parce que les deux moitiés le portent : le modèle avait
renvoyé `label = "Ouvrir l'import"`, et la carte compose son titre avec
`pending.describeScreen` = « Ouvrir {{label}} ». Chacune est juste seule ; leur
somme ne l'est pas.

─────────────────────────────────────────────────────────────────────────────
POURQUOI LA CORRECTION VIT ICI, ET PAS DANS LA CARTE
─────────────────────────────────────────────────────────────────────────────
Le libellé ne sert pas qu'au titre : la carte le REND AUSSI nu, sur la ligne
« Écran ». Le corriger dans la composition du titre laisserait « Ouvrir
l'import » sur l'autre ligne, où le verbe n'a rien à faire non plus.

Et la carte n'est pas seule à le lire : mobile et journal d'activité le
rendront à leur tour. Une dérivation vit à UN endroit (GA-26) — celui qui
FABRIQUE la proposition, pas chacun de ceux qui l'affichent.

⚠️ Le nettoyage est volontairement ÉTROIT — seulement le verbe d'ouverture, et
seulement en tête. « Voir la fiche au registre » garde son verbe : la carte ne
préfixe rien devant un libellé de ce genre… mais surtout, retirer « Voir » là
changerait le SENS. On ne retire que ce que la carte remet.
"""

from __future__ import annotations

import pytest

from app.services import chat_tools

USER = "22222222-2222-4222-8222-222222222222"


async def _label(raw: str) -> str:
    result = await chat_tools.execute_chat_tool(
        "propose_guided_action",
        {"route": "/settings/import", "label": raw, "highlight": "Déposer ton fichier"},
        user_id=USER,
        profile_data=None,
    )
    assert "error" not in result, result
    return str(result["proposal"]["label"])


@pytest.mark.asyncio
async def test_le_verbe_douverture_en_tete_est_retire() -> None:
    # Le cas exact mesuré en production.
    assert await _label("Ouvrir l'import") == "l'import"


@pytest.mark.asyncio
async def test_les_formes_du_verbe_douverture_sont_toutes_reconnues() -> None:
    for brut, attendu in (
        ("Ouvrir l’import", "l’import"),
        ("ouvrir l'import", "l'import"),
        ("Ouvre l'import", "l'import"),
        ("Open the import", "the import"),
        ("Aller à l'import", "l'import"),
        ("Aller dans les réglages", "les réglages"),
        ("Go to import", "import"),
    ):
        assert await _label(brut) == attendu, brut


@pytest.mark.asyncio
async def test_un_nom_decran_deja_nu_ne_bouge_pas() -> None:
    # Le cas NORMAL, et de loin le plus fréquent : rien ne doit lui arriver.
    for nom in ("Import", "Réglages › Profil", "Mémoire", "Compléter le profil"):
        assert await _label(nom) == nom, nom


@pytest.mark.asyncio
async def test_un_autre_verbe_garde_le_sien() -> None:
    # ⚠️ Le témoin du cas légitime voisin : on ne retire QUE ce que la carte
    # remet. « Voir », « Vérifier », « Compléter » restent — les retirer
    # changerait le sens du libellé.
    for nom in ("Voir la fiche au registre", "Vérifier tes crédits", "Compléter ton profil"):
        assert await _label(nom) == nom, nom


@pytest.mark.asyncio
async def test_un_libelle_reduit_a_son_seul_verbe_est_refuse() -> None:
    # « Ouvrir » tout court ne nomme AUCUN écran. Après nettoyage il ne reste
    # rien — et une carte sans libellé serait pire que la répétition qu'on
    # corrige : elle afficherait « Ouvrir » et n'aurait rien à dire sur la
    # ligne « Écran ».
    result = await chat_tools.execute_chat_tool(
        "propose_guided_action",
        {"route": "/settings/import", "label": "Ouvrir", "highlight": "Déposer ton fichier"},
        user_id=USER,
        profile_data=None,
    )
    assert "error" in result
